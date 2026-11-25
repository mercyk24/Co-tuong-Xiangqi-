// Lõi điểm hẹn riêng của app cờ tướng.
//
// Nói cùng giao thức với PeerJS (OPEN, HEARTBEAT, OFFER, ANSWER, CANDIDATE, EXPIRE, ID-TAKEN), nên app dùng chung
// một đoạn mã cho cả điểm hẹn này lẫn điểm hẹn công cộng 0.peerjs.com. Khác PeerJS ở ba điểm:
//   1. Mỗi phòng là một "ô" riêng (tham số room=mã phòng). Hai máy cùng phòng chỉ thấy nhau, không thấy phòng khác,
//      nên trên Cloudflare mỗi phòng chạy ở một Durable Object riêng và số phòng tăng bao nhiêu cũng được.
//   2. Có thêm tin RELAY: khi mạng không cho hai máy nối thẳng, tin ván cờ đi qua máy chủ (thay cho máy chủ TURN).
//   3. Khi một máy rời điểm hẹn, máy còn lại nhận LEAVE (để biết sớm khi đang chơi qua máy chủ).
//
// File này không phụ thuộc nền tảng: worker.mjs (Cloudflare) và dev-server.mjs (Node, để chạy thử) cùng dùng.
// Mỗi nền tảng đưa vào một "adapter":
//   list()            -> [{ ws, meta }] mọi kết nối đang mở trong phòng (meta có thể null nếu chưa nhận)
//   send(ws, obj)     gửi một tin JSON
//   close(ws, code, reason)
//   setMeta(ws, meta) lưu thông tin của kết nối (Cloudflare: lưu kèm để còn nhớ sau khi ngủ đông)

export const PROTO = 1;
export const HEARTBEAT = '{"type":"HEARTBEAT"}';   // tin nhịp tim; Cloudflare tự trả lời, không đánh thức máy chủ
export const LIMITS = {
  perRoom: 3,         // chủ phòng + khách + một máy thứ ba (để kịp báo "phòng đã có người")
  msgBytes: 16384,    // một lời mời WebRTC thường 1–4 KB
  relayBytes: 4096,   // một tin ván cờ chỉ vài chục byte; ván dài nhất (gửi lại cả ván) vẫn dưới 4 KB
  burst: 60,          // số tin được gửi dồn một lúc
  refillPerSec: 5     // sau đó trung bình tối đa 5 tin mỗi giây
};

const ROOM_RE = /^[a-z0-9]{6}$/;
const ID_RE = /^xqvn-[a-z0-9]{2,24}$/;
const TOKEN_RE = /^[a-z0-9]{4,32}$/;

// Kiểm tra tham số khi máy mở kết nối. Trả về '' nếu hợp lệ, ngược lại là lý do.
export function checkJoin(p) {
  if (!p || p.key !== 'peerjs') return 'bad-key';
  if (!ROOM_RE.test(p.room || '')) return 'bad-room';
  if (!ID_RE.test(p.id || '')) return 'bad-id';
  if (!TOKEN_RE.test(p.token || '')) return 'bad-token';
  // Chủ phòng có mã máy đúng bằng mã phòng; khách có mã máy bắt đầu bằng "xqvn-g"
  if (p.id !== 'xqvn-' + p.room && p.id.indexOf('xqvn-g') !== 0) return 'bad-id';
  return '';
}

export function paramsOf(url) {
  const q = new URL(url).searchParams;
  return { key: q.get('key'), id: q.get('id'), token: q.get('token'), room: (q.get('room') || '').toLowerCase() };
}

// Dạng tin phải giống thư viện PeerJS 1.5.5 (giống bộ kiểm tra của app)
export function validPayload(type, p) {
  if (type === 'RELAY') return !!(p && typeof p.d === 'string' && p.d.length <= LIMITS.relayBytes);
  if (!p || p.type !== 'data' || typeof p.connectionId !== 'string' || p.connectionId.length > 64) return false;
  if (type === 'OFFER') return !!(p.sdp && /^v=0/.test(p.sdp.sdp || '') && p.label && p.serialization);
  if (type === 'ANSWER') return !!(p.sdp && /^v=0/.test(p.sdp.sdp || ''));
  if (type === 'CANDIDATE') return !!(p.candidate && typeof p.candidate.candidate === 'string');
  return false;
}

const ROUTED = new Set(['OFFER', 'ANSWER', 'CANDIDATE', 'RELAY']);

function others(ad, ws) { return ad.list().filter(s => s.ws !== ws && s.meta); }
function kick(ad, ws, why) {
  try { ad.send(ws, { type: 'ERROR', payload: { msg: why } }); } catch (e) { /* đã đóng */ }
  ad.close(ws, 1008, why);
}

// Máy mới vào phòng (tham số đã qua checkJoin). Trả về true nếu được nhận.
export function onConnect(ad, ws, p, now) {
  const rest = others(ad, ws);
  const same = rest.find(s => s.meta.id === p.id);
  if (same) {
    // Cùng mã máy và cùng thẻ = chính máy đó nối lại (kết nối cũ chưa kịp đóng): thay kết nối cũ.
    if (same.meta.token !== p.token) { ad.send(ws, { type: 'ID-TAKEN', payload: { msg: 'ID "' + p.id + '" is taken' } }); ad.close(ws, 1008, 'id-taken'); return false; }
    ad.setMeta(same.ws, null);                           // kết nối cũ không còn nhận tin, kể cả khi chưa đóng hẳn
    ad.close(same.ws, 1000, 'replaced');
  }
  const count = rest.filter(s => !same || s.ws !== same.ws).length;
  if (count + 1 > LIMITS.perRoom) { kick(ad, ws, 'room-full'); return false; }
  ad.setMeta(ws, { id: p.id, token: p.token, room: p.room, tokens: LIMITS.burst, at: now });
  ad.send(ws, { type: 'OPEN', payload: { relay: 1, proto: PROTO } });
  return true;
}

export function onMessage(ad, ws, data, now) {
  const meta = ad.list().find(s => s.ws === ws);
  const me = meta && meta.meta;
  if (!me) return;
  if (typeof data !== 'string') { kick(ad, ws, 'binary'); return; }
  if (data === HEARTBEAT) { ad.send(ws, { type: 'HEARTBEAT' }); return; }
  if (data.length > LIMITS.msgBytes) { kick(ad, ws, 'too-big'); return; }
  // Giới hạn tốc độ (gáo nước): đầy 60 tin, mỗi giây đổ thêm 5
  me.tokens = Math.min(LIMITS.burst, me.tokens + (now - me.at) / 1000 * LIMITS.refillPerSec);
  me.at = now;
  if (me.tokens < 1) { kick(ad, ws, 'rate-limit'); return; }
  me.tokens -= 1;
  ad.setMeta(ws, me);

  let m; try { m = JSON.parse(data); } catch (e) { kick(ad, ws, 'bad-json'); return; }
  if (!m || typeof m.type !== 'string') { kick(ad, ws, 'bad-message'); return; }
  if (m.type === 'HEARTBEAT' || m.type === 'LEAVE') return;
  if (!ROUTED.has(m.type)) return;                       // loại tin khác: bỏ qua như PeerJS
  if (!validPayload(m.type, m.payload)) { kick(ad, ws, 'bad-message'); return; }
  const dst = others(ad, ws).find(s => s.meta.id === m.dst);
  if (!dst) { ad.send(ws, { type: 'EXPIRE', src: String(m.dst || '').slice(0, 40), dst: me.id }); return; }
  ad.send(dst.ws, { type: m.type, src: me.id, dst: m.dst, payload: m.payload });
}

// Một máy rời phòng (meta: thông tin đã lưu của kết nối đó): báo cho máy còn lại
export function onClose(ad, ws, meta) {
  const id = meta && meta.id;
  if (!id) return;
  const rest = others(ad, ws);
  if (rest.some(s => s.meta.id === id)) return;          // chính máy đó đã nối lại bằng kết nối mới
  for (const s of rest) { try { ad.send(s.ws, { type: 'LEAVE', src: id }); } catch (e) { /* đã đóng */ } }
}
