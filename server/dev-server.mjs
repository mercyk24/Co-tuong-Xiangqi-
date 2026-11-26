#!/usr/bin/env node
// Điểm hẹn chạy trên máy (Node, không cần cài thêm gì): dùng để kiểm tra tự động và thử tải.
// Cùng lõi core.mjs với bản Cloudflare, chỉ khác phần giữ kết nối.
//   node server/dev-server.mjs [cổng=4174]
// WebSocket được tự viết ở mức tối thiểu (RFC 6455: bắt tay, khung văn bản, ping/pong, đóng).
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { checkJoin, paramsOf, roomKey, onConnect, onMessage, onClose } from './core.mjs';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class Sock {
  constructor(socket, onText, onEnd) {
    this.s = socket; this.buf = Buffer.alloc(0); this.frag = null; this.open = true; this.meta = null;
    this.onText = onText; this.onEnd = onEnd;
    socket.setNoDelay(true);
    socket.on('data', d => this.feed(d));
    socket.on('close', () => this.end());
    socket.on('error', () => this.end());
  }
  end() { if (!this.open) return; this.open = false; try { this.s.destroy(); } catch (e) { /* đã đóng */ } this.onEnd(this); }
  feed(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) { this.end(); return; }
      const need = off + (masked ? 4 : 0) + len;
      if (b.length < need) return;
      let data = b.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const k = b.subarray(off, off + 4); data = Buffer.from(data); for (let i = 0; i < data.length; i++) data[i] ^= k[i & 3]; }
      this.buf = b.subarray(need);
      if (op === 0x8) { this.frame(0x8, data.subarray(0, 2)); this.end(); return; }
      if (op === 0x9) { this.frame(0xA, data); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x2) this.frag = { op, parts: [data] };
      else if (op === 0x0 && this.frag) this.frag.parts.push(data);
      if (fin && this.frag) {
        const f = this.frag; this.frag = null;
        const all = Buffer.concat(f.parts);
        this.onText(this, f.op === 0x1 ? all.toString('utf8') : all);
      }
    }
  }
  frame(op, payload) {
    if (!this.open) return;
    const len = payload.length;
    let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    try { this.s.write(Buffer.concat([head, payload])); } catch (e) { this.end(); }
  }
  send(text) { this.frame(0x1, Buffer.from(text, 'utf8')); }
  close(code, reason) {
    if (!this.open) return;
    const r = Buffer.from(String(reason || '').slice(0, 100)); const p = Buffer.alloc(2 + r.length);
    p.writeUInt16BE(code || 1000, 0); r.copy(p, 2);
    this.frame(0x8, p);
    setTimeout(() => this.end(), 50);
  }
}

export function startServer(port = 4174, log = () => {}) {
  const rooms = new Map();          // khoá phòng (roomKey: tách cờ vua / cờ tướng) -> Set<Sock>
  const stats = { open: 0, peak: 0, msgs: 0, rooms: 0 };
  const adapterFor = room => ({
    list: () => [...(rooms.get(room) || [])].map(ws => ({ ws, meta: ws.meta })),
    send: (ws, o) => ws.send(JSON.stringify(o)),
    close: (ws, code, reason) => ws.close(code, reason),
    setMeta: (ws, m) => { ws.meta = m; }
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ ok: true, service: 'co-tuong-signal', ...stats })); return; }
    res.writeHead(404); res.end();
  });
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://x');
    const p = paramsOf('http://x' + req.url);
    const bad = url.pathname !== '/peerjs' ? 'bad-path' : checkJoin(p);
    const key = req.headers['sec-websocket-key'];
    if (bad || !key) { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n' + (bad || 'no-key')); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    const rk = roomKey(p);
    const ad = adapterFor(rk);
    const ws = new Sock(socket, (w, text) => { stats.msgs++; onMessage(ad, w, text, Date.now()); }, w => {
      const set = rooms.get(rk);
      if (set) { set.delete(w); if (!set.size) rooms.delete(rk); }
      stats.open--; stats.rooms = rooms.size;
      onClose(ad, w, w.meta);
    });
    if (!rooms.has(rk)) rooms.set(rk, new Set());
    rooms.get(rk).add(ws);
    stats.open++; stats.peak = Math.max(stats.peak, stats.open); stats.rooms = rooms.size;
    if (!onConnect(ad, ws, p, Date.now())) log('từ chối ' + p.id);
  });
  return new Promise(resolve => server.listen(port, () => resolve({ server, stats, close: () => new Promise(r => { for (const set of rooms.values()) for (const w of set) w.end(); server.close(r); }) })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = +(process.argv[2] || process.env.PORT || 4174);
  startServer(port, s => console.log(s)).then(() => console.log('Điểm hẹn chạy thử tại ws://localhost:' + port + '/peerjs  (Ctrl+C để dừng)'));
}
