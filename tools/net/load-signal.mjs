#!/usr/bin/env node
// Thử tải điểm hẹn riêng (server/): giả lập nhiều cặp người chơi vào phòng cùng lúc.
//
//   node tools/net/load-signal.mjs [địa chỉ] [--cap 2500] [--ramp 20] [--relay 30] [--hold 10] [--origin URL] [--json file]
//
//   địa chỉ   mặc định ws://127.0.0.1:4174 (server/dev-server.mjs) — hoặc wss://... (Cloudflare)
//   --cap     số cặp (mỗi cặp 2 kết nối). 2500 cặp = 5000 người cùng lúc
//   --ramp    số giây để lần lượt mở hết các cặp (người chơi không vào cùng một mili giây)
//   --relay   số tin ván cờ mỗi cặp gửi qua máy chủ (giả lập cặp không nối thẳng được); 0 = chỉ thử bắt tay
//   --hold    giữ mọi kết nối thêm bao nhiêu giây sau khi tất cả đã vào phòng (để đo lúc đông nhất)
//   --check   kiểm tra đúng giao thức: EXPIRE, ID-TAKEN, nối lại cùng thẻ, phòng đầy, người xem, LEAVE, nhịp tim.
//             Chỉ kiểm tra, KHÔNG thử tải, trừ khi ghi thêm --cap (ví dụ --check --cap 500: kiểm tra rồi thử tải 500 cặp).
//
// Lưu ý: máy chủ trên Cloudflare giới hạn 120 lần mở kết nối mỗi phút cho một địa chỉ IP (wrangler.jsonc, CONN_LIMIT).
// Thử tải từ một máy sẽ bị chặn phần lớn; muốn đo sức chịu tải thật phải chạy từ nhiều địa chỉ IP,
// hoặc thử với server/dev-server.mjs / wrangler dev trên máy (không có giới hạn này).
//
// Mỗi cặp làm đúng như app: chủ phòng mở kết nối, khách mở kết nối, khách gửi OFFER, chủ trả ANSWER,
// mỗi bên gửi 4 CANDIDATE, rồi (tuỳ chọn) gửi qua lại các tin RELAY và đo thời gian khứ hồi.
// Cuối cùng in tỉ lệ thành công, thời gian (trung vị, p95, p99) và các lỗi gặp phải.

const args = process.argv.slice(2);
const opt = { url: 'ws://127.0.0.1:4174', cap: 2500, ramp: 20, relay: 30, hold: 10, origin: '', json: '', check: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--check') opt.check = true;
  else if (a.startsWith('--')) { const k = a.slice(2); const v = args[++i]; opt[k] = ['cap', 'ramp', 'relay', 'hold'].includes(k) ? +v : v; if (k === 'cap') opt.capSet = true; }
  else opt.url = a;
}
const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const rnd = n => { let s = ''; for (let i = 0; i < n; i++) s += CHARS[(Math.random() * CHARS.length) | 0]; return s; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sdp = (t, u) => ['v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', 'a=ice-ufrag:' + u, 'a=ice-pwd:' + rnd(24), 'a=ice-options:trickle',
  'a=fingerprint:sha-256 6B:8B:5D:EA:59:04:20:23:29:C8:87:1C:CC:87:32:BE:DD:8C:66:A5:8E:50:55:EA:8C:D3:B6:5C:09:5E:D6:BC',
  'a=setup:' + (t === 'offer' ? 'actpass' : 'active'), 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ''].join('\r\n');
const cand = u => ({ candidate: 'candidate:842163049 1 udp 1677729535 203.0.113.' + ((Math.random() * 250) | 0) + ' ' + (40000 + ((Math.random() * 20000) | 0)) + ' typ srflx raddr 0.0.0.0 rport 0 generation 0 ufrag ' + u, sdpMid: '0', sdpMLineIndex: 0, usernameFragment: u });

const stats = { open: 0, peak: 0, ok: 0, fail: 0, errors: {}, tOpen: [], tAnswer: [], tRelay: [], tPair: [] };
const err = why => { stats.errors[why] = (stats.errors[why] || 0) + 1; };

function client(id, room, token, raw) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const url = opt.url.replace(/\/$/, '') + '/peerjs?key=peerjs&id=' + id + '&token=' + token + '&version=1.5.5&room=' + room;
    let ws;
    try { ws = opt.origin ? new WebSocket(url, { headers: { Origin: opt.origin } }) : new WebSocket(url); } catch (e) { reject(new Error('mở kết nối: ' + e.message)); return; }
    const c = { ws, id, q: [], waiters: [], closed: false };
    c.send = o => ws.send(JSON.stringify(o));
    c.wait = (pred, ms) => new Promise((res, rej) => {
      const i = c.q.findIndex(pred); if (i >= 0) { res(c.q.splice(i, 1)[0]); return; }
      const w = { pred, res, t: setTimeout(() => { c.waiters.splice(c.waiters.indexOf(w), 1); rej(new Error('chờ quá lâu')); }, ms) };
      c.waiters.push(w);
    });
    const timer = setTimeout(() => { reject(new Error('mở quá lâu')); try { ws.close(); } catch (e) { /* bỏ qua */ } }, 20000);
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.type === 'OPEN') { clearTimeout(timer); c.counted = true; stats.open++; stats.peak = Math.max(stats.peak, stats.open); stats.tOpen.push(Date.now() - t0); resolve(c); return; }
      if (raw && (m.type === 'ERROR' || m.type === 'ID-TAKEN')) { clearTimeout(timer); resolve(Object.assign(c, { refused: m })); return; }
      if (m.type === 'ERROR' || m.type === 'ID-TAKEN') { clearTimeout(timer); reject(new Error('máy chủ báo ' + m.type + ' ' + ((m.payload && m.payload.msg) || ''))); return; }
      const w = c.waiters.find(x => x.pred(m));
      if (w) { c.waiters.splice(c.waiters.indexOf(w), 1); clearTimeout(w.t); w.res(m); } else c.q.push(m);
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('lỗi kết nối')); };
    ws.onclose = () => { c.closed = true; if (c.counted && !c.down) { c.down = true; stats.open--; } };
  });
}

let allIn; const allInP = new Promise(r => { allIn = r; });
let settled = 0;

async function pair(n) {
  const room = rnd(6), hostId = 'xqvn-' + room, guestId = 'xqvn-g' + rnd(10);
  const t0 = Date.now();
  let h, g, paired = false;
  try {
    h = await client(hostId, room, rnd(10));
    g = await client(guestId, room, rnd(10));
    const cid = 'dc_' + rnd(10);
    const ta = Date.now();
    g.send({ type: 'OFFER', dst: hostId, payload: { sdp: { type: 'offer', sdp: sdp('offer', 'aB1c') }, type: 'data', connectionId: cid, label: cid, reliable: false, serialization: 'binary' } });
    await h.wait(m => m.type === 'OFFER' && m.src === guestId, 15000);
    h.send({ type: 'ANSWER', dst: guestId, payload: { sdp: { type: 'answer', sdp: sdp('answer', 'xY2z') }, type: 'data', connectionId: cid } });
    await g.wait(m => m.type === 'ANSWER', 15000);
    stats.tAnswer.push(Date.now() - ta);
    for (let i = 0; i < 4; i++) {
      g.send({ type: 'CANDIDATE', dst: hostId, payload: { candidate: cand('aB1c'), type: 'data', connectionId: cid } });
      h.send({ type: 'CANDIDATE', dst: guestId, payload: { candidate: cand('xY2z'), type: 'data', connectionId: cid } });
    }
    for (let i = 0; i < 4; i++) { await h.wait(m => m.type === 'CANDIDATE', 15000); await g.wait(m => m.type === 'CANDIDATE', 15000); }
    for (let i = 0; i < opt.relay; i++) {
      const tr = Date.now();
      g.send({ type: 'RELAY', dst: hostId, payload: { d: JSON.stringify({ t: 'ping', n: i }) } });
      await h.wait(m => m.type === 'RELAY', 15000);
      h.send({ type: 'RELAY', dst: guestId, payload: { d: JSON.stringify({ t: 'pong' }) } });
      await g.wait(m => m.type === 'RELAY', 15000);
      stats.tRelay.push(Date.now() - tr);
      await sleep(150);
    }
    stats.ok++; paired = true; stats.tPair.push(Date.now() - t0);
  } catch (e) { stats.fail++; err(e.message); }
  settled++;
  if (settled === opt.cap) allIn();
  await allInP;                       // giữ kết nối cho tới khi mọi cặp đều xong, để đo lúc đông nhất
  await sleep(opt.hold * 1000);
  // Kiểm tra kết nối vẫn sống ở lúc đông nhất: gửi một tin cuối
  if (paired && !h.closed && !g.closed) {
    try { g.send({ type: 'RELAY', dst: hostId, payload: { d: '{"t":"bye"}' } }); await h.wait(m => m.type === 'RELAY', 15000); } catch (e) { stats.fail++; stats.ok--; err('rớt khi đang đông: ' + e.message); }
  }
  for (const c of [h, g]) if (c) { try { c.ws.close(); } catch (e) { /* bỏ qua */ } }
}

// Kiểm tra giao thức trên máy chủ thật (Cloudflare hoặc Node) trước khi thử tải
async function checks() {
  const room = rnd(6), H = 'xqvn-' + room;
  const res = [];
  const ok = (name, cond) => { res.push((cond ? 'ĐẠT   ' : 'HỎNG  ') + name); if (!cond) checks.bad = true; };
  const h = await client(H, room, 'tok' + rnd(8));
  const g = await client('xqvn-g' + rnd(8), room, 'tok' + rnd(8));
  g.send({ type: 'RELAY', dst: 'xqvn-khongco', payload: { d: '{}' } });
  const ex = await g.wait(m => m.type === 'EXPIRE', 5000).catch(() => null);
  ok('gửi tới máy không có trong phòng thì nhận EXPIRE', !!ex);
  g.ws.send('{"type":"HEARTBEAT"}');
  const hb = await g.wait(m => m.type === 'HEARTBEAT', 5000).catch(() => null);
  ok('nhịp tim được trả lời', !!hb);
  const fake = await client(H, room, 'tok' + rnd(8), true);
  ok('mã máy đã có người dùng, khác thẻ thì bị từ chối (ID-TAKEN)', !!(fake.refused && fake.refused.type === 'ID-TAKEN'));
  const third = await client('xqvn-g' + rnd(8), room, 'tok' + rnd(8), true);
  const fourth = await client('xqvn-g' + rnd(8), room, 'tok' + rnd(8), true);
  ok('phòng nhận tối đa 3 kết nối, kết nối thứ 4 bị báo phòng đầy', !third.refused && !!(fourth.refused && fourth.refused.payload && fourth.refused.payload.msg === 'room-full'));
  try { third.ws.close(); } catch (e) { /* bỏ qua */ }
  await g.wait(m => m.type === 'LEAVE', 5000).catch(() => null);    // bỏ tin LEAVE của máy thứ ba
  const tok = 'tok' + rnd(8);
  const g2 = await client('xqvn-g' + rnd(8), room, tok);
  const g2b = await client(g2.id, room, tok, true);
  ok('cùng mã máy và cùng thẻ (nối lại) thì được nhận', !g2b.refused);
  h.send({ type: 'RELAY', dst: g2.id, payload: { d: '{"t":"x"}' } });
  const viaNew = await g2b.wait(m => m.type === 'RELAY', 5000).catch(() => null);
  ok('sau khi nối lại, tin tới đúng kết nối mới', !!viaNew);
  const leaveBefore = h.q.filter(m => m.type === 'LEAVE' && m.src === g2.id).length;
  await sleep(500);
  ok('nối lại không làm máy kia tưởng đã rời phòng', h.q.filter(m => m.type === 'LEAVE' && m.src === g2.id).length === leaveBefore);
  // Người xem
  const w = await client('xqvn-w' + rnd(8), room, 'tok' + rnd(8), true);
  ok('người xem vào được khi phòng đã có người chơi', !w.refused);
  const wn = await h.wait(m => m.type === 'WATCH', 5000).catch(() => null);
  ok('chủ phòng được báo có người xem (WATCH)', !!(wn && wn.payload && wn.payload.n === 1));
  h.send({ type: 'CAST', payload: { d: '{"t":"snap"}' } });
  const cs = await w.wait(m => m.type === 'CAST', 5000).catch(() => null);
  ok('thế cờ chủ phòng phát (CAST) tới người xem', !!(cs && cs.payload.d === '{"t":"snap"}'));
  try { w.ws.close(); } catch (e) { /* bỏ qua */ }
  const w0 = await h.wait(m => m.type === 'WATCH', 5000).catch(() => null);
  ok('người xem rời thì chủ phòng được báo còn 0 người xem', !!(w0 && w0.payload.n === 0));
  g.ws.close();
  const lv = await h.wait(m => m.type === 'LEAVE' && m.src === g.id, 5000).catch(() => null);
  ok('máy rời phòng thì máy kia nhận LEAVE', !!lv);
  for (const c of [h, g2b]) try { c.ws.close(); } catch (e) { /* bỏ qua */ }
  console.log('KIỂM TRA GIAO THỨC\n  ' + res.join('\n  '));
  await sleep(800);                       // chờ các kết nối kiểm tra đóng hẳn rồi mới đếm lại từ đầu
  stats.open = 0; stats.peak = 0; stats.tOpen = [];
}

const pct = (a, p) => { if (!a.length) return '-'; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))] + ' ms'; };
(async () => {
  if (opt.check) {
    try { await checks(); } catch (e) { console.log('Không vào được điểm hẹn (' + e.message + '). Nếu máy chủ có ALLOWED_ORIGINS thì thêm --origin <địa chỉ trang của app>.'); process.exit(2); }
    if (checks.bad) { console.log('Giao thức chưa đúng, dừng thử tải.'); process.exit(2); }
    if (!opt.capSet || !opt.cap) process.exit(0);  // --check một mình: chỉ kiểm tra, không thử tải
  }
  console.log('Thử tải ' + opt.url + ': ' + opt.cap + ' cặp (' + opt.cap * 2 + ' người), mở dần trong ' + opt.ramp + ' giây, ' + opt.relay + ' tin qua máy chủ mỗi cặp');
  const t0 = Date.now();
  const all = [];
  const mon = setInterval(() => process.stdout.write('  … ' + ((Date.now() - t0) / 1000).toFixed(0) + 's: đang mở ' + stats.open + ' kết nối, xong ' + settled + '/' + opt.cap + ' cặp, lỗi ' + stats.fail + '\n'), 5000);
  for (let i = 0; i < opt.cap; i++) {
    all.push(pair(i));
    const due = t0 + (i + 1) / opt.cap * opt.ramp * 1000;
    if (due > Date.now()) await sleep(due - Date.now());
  }
  await Promise.all(all);
  clearInterval(mon);
  const r = {
    url: opt.url, pairs: opt.cap, users: opt.cap * 2, seconds: +((Date.now() - t0) / 1000).toFixed(1),
    ok: stats.ok, fail: stats.fail, okRate: +(stats.ok / opt.cap * 100).toFixed(2), peakOpen: stats.peak,
    open: { p50: pct(stats.tOpen, 50), p95: pct(stats.tOpen, 95), p99: pct(stats.tOpen, 99) },
    offerAnswer: { p50: pct(stats.tAnswer, 50), p95: pct(stats.tAnswer, 95), p99: pct(stats.tAnswer, 99) },
    relayRtt: { p50: pct(stats.tRelay, 50), p95: pct(stats.tRelay, 95), p99: pct(stats.tRelay, 99), count: stats.tRelay.length },
    errors: stats.errors
  };
  console.log('\nKẾT QUẢ');
  console.log('  Cặp thành công: ' + r.ok + '/' + r.pairs + ' (' + r.okRate + '%)  |  đông nhất: ' + r.peakOpen + ' kết nối mở cùng lúc  |  ' + r.seconds + ' giây');
  console.log('  Vào điểm hẹn:       trung vị ' + r.open.p50 + ', p95 ' + r.open.p95 + ', p99 ' + r.open.p99);
  console.log('  Lời mời → trả lời:  trung vị ' + r.offerAnswer.p50 + ', p95 ' + r.offerAnswer.p95 + ', p99 ' + r.offerAnswer.p99);
  if (opt.relay) console.log('  Tin qua máy chủ (khứ hồi): trung vị ' + r.relayRtt.p50 + ', p95 ' + r.relayRtt.p95 + ', p99 ' + r.relayRtt.p99 + ' (' + r.relayRtt.count + ' lượt)');
  console.log('  Lỗi: ' + (Object.keys(r.errors).length ? JSON.stringify(r.errors) : 'không có'));
  if (opt.json) (await import('node:fs')).writeFileSync(opt.json, JSON.stringify(r, null, 2));
  process.exit(r.fail ? 1 : 0);
})();
