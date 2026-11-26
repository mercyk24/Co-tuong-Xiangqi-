// Lõi điểm hẹn riêng của app cờ tướng.
//
// Nói cùng giao thức với PeerJS (OPEN, HEARTBEAT, OFFER, ANSWER, CANDIDATE, EXPIRE, ID-TAKEN), nên app dùng chung
// một đoạn mã cho cả điểm hẹn này lẫn điểm hẹn công cộng 0.peerjs.com. Khác PeerJS ở ba điểm:
//   1. Mỗi phòng là một "ô" riêng (tham số room=mã phòng). Hai máy cùng phòng chỉ thấy nhau, không thấy phòng khác,
//      nên trên Cloudflare mỗi phòng chạy ở một Durable Object riêng và số phòng tăng bao nhiêu cũng được.
//   2. Có thêm tin RELAY: khi mạng không cho hai máy nối thẳng, tin ván cờ đi qua máy chủ (thay cho máy chủ TURN).
//   3. Khi một máy rời điểm hẹn, máy còn lại nhận LEAVE (để biết sớm khi đang chơi qua máy chủ).
//   4. Người xem (mã máy "xqvn-w…"): không đi quân, chỉ nhận thế cờ. Chủ phòng gửi CAST (thế cờ hiện tại),
//      máy chủ chuyển cho mọi người xem trong phòng; khi số người xem đổi, chủ phòng nhận WATCH {n} và gửi lại thế cờ.
//      Tin máy chủ gửi đi không tính phí trên Cloudflare, nên một chủ phòng gửi một lần là đủ cho mọi người xem.
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
  perRoom: 3,         // người chơi: chủ phòng + khách + một máy thứ ba (để kịp báo "phòng đã có người")
  watchers: 20,       // người xem tối đa mỗi phòng (tính riêng)
  msgBytes: 16384,    // một lời mời WebRTC thường 1–4 KB
  relayBytes: 4096,   // một tin ván cờ chỉ vài chục byte; ván dài nhất (gửi lại cả ván) vẫn dưới 4 KB
  burst: 60,          // số tin được gửi dồn một lúc
  refillPerSec: 5     // sau đó trung bình tối đa 5 tin mỗi giây
};

const ROOM_RE = /^[a-z0-9]{6}$/;
const ID_RE = /^x[qcg]vn-[a-z0-9]{2,24}$/;
// Mỗi loại cờ một tiền tố mã máy: 'xqvn-' cờ tướng, 'xcvn-' cờ vua, 'xgvn-' cờ vây. Phòng của các loại cờ tách hẳn nhau
// (khác Durable Object), nên mã phòng trùng nhau cũng không bao giờ nối nhầm sang loại cờ khác.
export const gameOf = id => String(id).slice(0, 5);
const ROOM_NS = { 'xqvn-': '', 'xcvn-': 'c:', 'xgvn-': 'g:' };   // cờ tướng giữ khoá cũ (không tiền tố) để phòng đang mở không bị ảnh hưởng
export const roomKey = p => (ROOM_NS[gameOf(p.id)] || '') + p.room;
const TOKEN_RE = /^[a-z0-9]{4,32}$/;

// Kiểm tra tham số khi máy mở kết nối. Trả về '' nếu hợp lệ, ngược lại là lý do.
export function checkJoin(p) {
  if (!p || p.key !== 'peerjs') return 'bad-key';
  if (!ROOM_RE.test(p.room || '')) return 'bad-room';
  if (!ID_RE.test(p.id || '')) return 'bad-id';
  if (!TOKEN_RE.test(p.token || '')) return 'bad-token';
  // Chủ phòng có mã máy đúng bằng mã phòng; khách bắt đầu bằng "<tiền tố>g"; người xem bắt đầu bằng "<tiền tố>w"
  const g = gameOf(p.id);
  if (p.id !== g + p.room && p.id.indexOf(g + 'g') !== 0 && p.id.indexOf(g + 'w') !== 0) return 'bad-id';
  return '';
}

export function paramsOf(url) {
  const q = new URL(url).searchParams;
  return { key: q.get('key'), id: q.get('id'), token: q.get('token'), room: (q.get('room') || '').toLowerCase() };
}

// Dạng tin phải giống thư viện PeerJS 1.5.5 (giống bộ kiểm tra của app)
export function validPayload(type, p) {
  if (type === 'CAST') return !!(p && typeof p.d === 'string' && p.d.length <= LIMITS.relayBytes && (p.to === undefined || typeof p.to === 'string'));
  if (type === 'RELAY') return !!(p && typeof p.d === 'string' && p.d.length <= LIMITS.relayBytes);
  if (!p || p.type !== 'data' || typeof p.connectionId !== 'string' || p.connectionId.length > 64) return false;
  if (type === 'OFFER') return !!(p.sdp && /^v=0/.test(p.sdp.sdp || '') && p.label && p.serialization);
  if (type === 'ANSWER') return !!(p.sdp && /^v=0/.test(p.sdp.sdp || ''));
  if (type === 'CANDIDATE') return !!(p.candidate && typeof p.candidate.candidate === 'string');
  return false;
}

const ROUTED = new Set(['OFFER', 'ANSWER', 'CANDIDATE', 'RELAY']);

function others(ad, ws) { return ad.list().filter(s => s.ws !== ws && s.meta); }
// Người xem: mã máy "<tiền tố>w…". Mã của chủ phòng là tiền tố + 6 ký tự mã phòng (dài đúng 11 ký tự) và có thể cũng
// bắt đầu bằng "w" khi mã phòng bắt đầu bằng W, nên mã dài đúng 11 ký tự không bao giờ là người xem.
export const isWatcher = id => { const s = String(id); return /^x[qcg]vn-w/.test(s) && s.length !== 11; };
const hostOf = (ad, room) => ad.list().find(s => s.meta && s.meta.id === gameOf(s.meta.id) + room);
const watchersOf = (ad, skip) => ad.list().filter(s => s.ws !== skip && s.meta && isWatcher(s.meta.id));
// Báo chủ phòng số người xem hiện tại (src: người vừa vào, để chủ phòng gửi thế cờ cho riêng người đó)
function tellHost(ad, room, src, skip) {
  const h = hostOf(ad, room);
  if (h) try { ad.send(h.ws, { type: 'WATCH', payload: { n: watchersOf(ad, skip).length, src: src || '' } }); } catch (e) { /* đã đóng */ }
}
function kick(ad, ws, why) {
  try { ad.send(ws, { type: 'ERROR', payload: { msg: why } }); } catch (e) { /* đã đóng */ }
  ad.close(ws, 1008, why);
}

// Máy mới vào phòng (tham số đã qua checkJoin). Trả về true nếu được nhận.
export function onConnect(ad, ws, p, now) {
  const rest = others(ad, ws);
  if (rest.some(s => gameOf(s.meta.id) !== gameOf(p.id))) { kick(ad, ws, 'bad-id'); return false; }   // không trộn hai loại cờ
  const same = rest.find(s => s.meta.id === p.id);
  if (same) {
    // Cùng mã máy và cùng thẻ = chính máy đó nối lại (kết nối cũ chưa kịp đóng): thay kết nối cũ.
    if (same.meta.token !== p.token) { ad.send(ws, { type: 'ID-TAKEN', payload: { msg: 'ID "' + p.id + '" is taken' } }); ad.close(ws, 1008, 'id-taken'); return false; }
    ad.setMeta(same.ws, null);                           // kết nối cũ không còn nhận tin, kể cả khi chưa đóng hẳn
    ad.close(same.ws, 1000, 'replaced');
  }
  const watch = isWatcher(p.id);
  const count = rest.filter(s => (!same || s.ws !== same.ws) && isWatcher(s.meta.id) === watch).length;
  if (count + 1 > (watch ? LIMITS.watchers : LIMITS.perRoom)) { kick(ad, ws, watch ? 'watch-full' : 'room-full'); return false; }
  ad.setMeta(ws, { id: p.id, token: p.token, room: p.room, tokens: LIMITS.burst, at: now });
  ad.send(ws, { type: 'OPEN', payload: { relay: 1, watch: 1, proto: PROTO } });
  if (watch) tellHost(ad, p.room, p.id);
  else if (p.id === gameOf(p.id) + p.room && watchersOf(ad).length) tellHost(ad, p.room, '');  // chủ phòng nối lại: gửi lại thế cờ
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
  if (isWatcher(me.id)) return;                          // người xem chỉ nhận, không gửi gì
  if (m.type === 'CAST') {
    // Chỉ chủ phòng được phát thế cờ; to: gửi riêng một người xem (người vừa vào), không có thì gửi tất cả
    if (me.id !== gameOf(me.id) + me.room || !validPayload('CAST', m.payload)) { kick(ad, ws, 'bad-message'); return; }
    for (const w of watchersOf(ad)) if (!m.payload.to || w.meta.id === m.payload.to) ad.send(w.ws, { type: 'CAST', src: me.id, payload: { d: m.payload.d } });
    return;
  }
  if (!ROUTED.has(m.type)) return;                       // loại tin khác: bỏ qua như PeerJS
  if (!validPayload(m.type, m.payload)) { kick(ad, ws, 'bad-message'); return; }
  const dst = others(ad, ws).find(s => s.meta.id === m.dst && !isWatcher(s.meta.id));
  if (!dst) { ad.send(ws, { type: 'EXPIRE', src: String(m.dst || '').slice(0, 40), dst: me.id }); return; }
  ad.send(dst.ws, { type: m.type, src: me.id, dst: m.dst, payload: m.payload });
}

// Một máy rời phòng (meta: thông tin đã lưu của kết nối đó): báo cho máy còn lại
export function onClose(ad, ws, meta) {
  const id = meta && meta.id;
  if (!id) return;
  const rest = others(ad, ws);
  if (rest.some(s => s.meta.id === id)) return;          // chính máy đó đã nối lại bằng kết nối mới
  if (isWatcher(id)) { tellHost(ad, meta.room, '', ws); return; }   // người xem rời: chỉ báo chủ phòng số người xem
  for (const s of rest) { try { ad.send(s.ws, { type: 'LEAVE', src: id }); } catch (e) { /* đã đóng */ } }
}
