#!/usr/bin/env node
// Thử riêng điểm hẹn PeerJS (0.peerjs.com) mà không cần trình duyệt: hai kết nối WebSocket gửi tin cho nhau.
// Dùng: node tools/check-signal.js     (cần Node 22+ có sẵn WebSocket, và Internet)
// Tin gửi đúng dạng thư viện PeerJS 1.5.5 (giống app). Máy chủ kiểm tra cả nội dung SDP, nên dùng SDP trông như thật.
'use strict';
const HOST = process.argv.slice(2).find(a => a.startsWith('ws')) || 'wss://0.peerjs.com:443/peerjs';
const rnd = () => Math.random().toString(36).slice(2, 10);
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

// SDP kênh dữ liệu trông như thật (máy chủ bỏ tin có SDP giả)
const sdp = (t, ufrag) => ['v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=extmap-allow-mixed', 'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', 'a=ice-ufrag:' + ufrag, 'a=ice-pwd:' + rnd() + rnd() + rnd(), 'a=ice-options:trickle',
  'a=fingerprint:sha-256 6B:8B:5D:EA:59:04:20:23:29:C8:87:1C:CC:87:32:BE:DD:8C:66:A5:8E:50:55:EA:8C:D3:B6:5C:09:5E:D6:BC',
  'a=setup:' + (t === 'offer' ? 'actpass' : 'active'), 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ''].join('\r\n');

function client(id) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(HOST + '?key=peerjs&id=' + id + '&token=' + rnd() + '&version=1.5.5');
    const c = { id, ws, inbox: [] };
    const t = setTimeout(() => reject(new Error('quá giờ mở ' + id)), 15000);
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.type === 'OPEN') { clearTimeout(t); log(id, 'OPEN'); resolve(c); return; }
      if (m.type === 'HEARTBEAT') return;
      log(id, 'nhận', m.type, 'từ', m.src, String(JSON.stringify(m.payload)).slice(0, 60));
      c.inbox.push(m);
    };
    ws.onerror = e => { clearTimeout(t); reject(new Error('lỗi WebSocket ' + id + ': ' + (e.message || e.type))); };
    c.send = (type, dst, payload) => { log(id, 'gửi', type, 'tới', dst); ws.send(JSON.stringify({ type, dst, payload })); };
    c.wait = (pred, ms) => new Promise((res, rej) => { const t0 = Date.now(); const i = setInterval(() => { const m = c.inbox.find(pred); if (m) { clearInterval(i); res(m); } else if (Date.now() - t0 > ms) { clearInterval(i); rej(new Error('không nhận được trong ' + ms + ' ms')); } }, 50); });
  });
}

(async () => {
  const a = await client('xqvn-test' + rnd()), b = await client('xqvn-g' + rnd());
  const hb = setInterval(() => { for (const c of [a, b]) c.ws.send(JSON.stringify({ type: 'HEARTBEAT' })); }, 5000);
  let ok = true;
  try {
    const cid = 'dc_' + rnd();
    b.send('OFFER', a.id, { sdp: { type: 'offer', sdp: sdp('offer', 'aB1c') }, type: 'data', connectionId: cid, label: cid, reliable: false, serialization: 'binary' });
    const m1 = await a.wait(m => m.type === 'OFFER', 10000);
    log('KẾT QUẢ 1: A nhận được OFFER, src =', m1.src, m1.src === b.id ? '(đúng)' : '(SAI src)');
    a.send('ANSWER', b.id, { sdp: { type: 'answer', sdp: sdp('answer', 'xY2z') }, type: 'data', connectionId: cid });
    await b.wait(m => m.type === 'ANSWER', 10000);
    log('KẾT QUẢ 2: B nhận được ANSWER');
    a.send('CANDIDATE', b.id, { candidate: { candidate: 'candidate:842163049 1 udp 1677729535 203.0.113.7 52011 typ srflx raddr 0.0.0.0 rport 0 generation 0 ufrag xY2z network-cost 999', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'xY2z' }, type: 'data', connectionId: cid });
    await b.wait(m => m.type === 'CANDIDATE', 10000);
    log('KẾT QUẢ 3: B nhận được CANDIDATE');
  } catch (e) { ok = false; log('LỖI:', e.message); }
  try {
    const cid2 = 'dc_' + rnd();
    b.send('OFFER', 'xqvn-khongco' + rnd(), { sdp: { type: 'offer', sdp: sdp('offer', 'qW3e') }, type: 'data', connectionId: cid2, label: cid2, reliable: false, serialization: 'binary' });
    await b.wait(m => m.type === 'EXPIRE', 20000);
    log('KẾT QUẢ 4: gửi tới mã không tồn tại thì nhận EXPIRE');
  } catch (e) { log('KẾT QUẢ 4: không nhận EXPIRE (' + e.message + ')'); }
  clearInterval(hb); a.ws.close(); b.ws.close();
  log(ok ? 'ĐIỂM HẸN CHẠY ĐÚNG' : 'ĐIỂM HẸN CÓ VẤN ĐỀ');
  process.exit(ok ? 0 : 1);
})().catch(e => { log('LỖI:', e.message); process.exit(1); });
