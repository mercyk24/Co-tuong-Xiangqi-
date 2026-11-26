// Máy chủ của app trên Cloudflare Workers.
//   /peerjs?...&room=MÃ   điểm hẹn chơi qua mạng; mỗi phòng là một Durable Object riêng (lõi: core.mjs)
//   /health               kiểm tra máy chủ còn sống
//   mọi đường khác        trang web (thư mục dist/), kèm tiêu đề COOP/COEP trong dist/_headers
//
// Durable Object dùng "WebSocket ngủ đông": khi hai máy đang nối thẳng với nhau và không gửi gì lên,
// phòng ngủ và không tốn tiền; tin nhịp tim được Cloudflare tự trả lời mà không đánh thức phòng.
import { DurableObject } from 'cloudflare:workers';
import { checkJoin, paramsOf, roomKey, onConnect, onMessage, onClose, HEARTBEAT } from './core.mjs';

// Giới hạn số lần mở kết nối từ một địa chỉ IP (mặc định 120 lần / phút, đặt trong wrangler.jsonc): chặn kẻ xấu mở ồ ạt
// kết nối để làm tốn tài nguyên hay dò mã phòng để vào xem trộm. Mức này rộng để nhiều người dùng chung một IP
// (4G, mạng trường học) vẫn chơi bình thường. Dịch vụ đếm của Cloudflare lỗi thì cho qua, không chặn người chơi.
async function underLimit(req, env) {
  if (!env.CONN_LIMIT) return true;                    // chưa cấu hình (chạy thử trên máy)
  const ip = req.headers.get('CF-Connecting-IP');
  if (!ip) return true;
  try { return (await env.CONN_LIMIT.limit({ key: 'ws:' + ip })).success; } catch (e) { return true; }
}

function allowedOrigin(req, env) {
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!list.length) return true;                       // chưa cấu hình: cho mọi nơi (chạy thử)
  const o = req.headers.get('Origin');
  return !!o && list.includes(o);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/peerjs') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Cần kết nối WebSocket', { status: 426 });
      if (!allowedOrigin(req, env)) return new Response('Không được phép', { status: 403 });
      if (!(await underLimit(req, env))) return new Response('Quá nhiều kết nối, hãy thử lại sau một phút', { status: 429 });
      const p = paramsOf(req.url);
      const bad = checkJoin(p);
      if (bad) return new Response(bad, { status: 400 });
      // Một Durable Object cho mỗi phòng; phòng cờ vua mang tiền tố "c:" nên không bao giờ trùng phòng cờ tướng
      return env.ROOMS.get(env.ROOMS.idFromName(roomKey(p))).fetch(req);
    }
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'co-tuong-signal' });
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('Không tìm thấy', { status: 404 });
  }
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT, HEARTBEAT));
    const ctxRef = ctx;
    this.ad = {
      list: () => ctxRef.getWebSockets().map(ws => ({ ws, meta: ws.deserializeAttachment() })),
      send: (ws, o) => ws.send(JSON.stringify(o)),
      close: (ws, code, reason) => { try { ws.close(code, reason); } catch (e) { /* đã đóng */ } },
      setMeta: (ws, m) => ws.serializeAttachment(m)
    };
  }
  async fetch(req) {
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    onConnect(this.ad, server, paramsOf(req.url), Date.now());
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, msg) { onMessage(this.ad, ws, msg, Date.now()); }
  async webSocketClose(ws) {
    let meta = null; try { meta = ws.deserializeAttachment(); } catch (e) { /* không có */ }
    onClose(this.ad, ws, meta);
    try { ws.close(1000, 'bye'); } catch (e) { /* đã đóng */ }
  }
  async webSocketError(ws) {
    let meta = null; try { meta = ws.deserializeAttachment(); } catch (e) { /* không có */ }
    onClose(this.ad, ws, meta);
  }
}
