// Kiểm tra lõi điểm hẹn riêng (server/core.mjs), không cần mạng.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'server', 'core.mjs')).href);

// Phòng giả: mỗi kết nối là một đối tượng ghi lại tin nhận được
function fakeRoom() {
  const socks = [];
  const ad = {
    list: () => socks.filter(s => s.open).map(ws => ({ ws, meta: ws.meta })),
    send: (ws, o) => { if (ws.open) ws.got.push(o); },
    close: (ws, code, reason) => { if (ws.open) { ws.open = false; ws.closed = { code, reason }; } },
    setMeta: (ws, m) => { ws.meta = m; }
  };
  const add = () => { const ws = { open: true, got: [], meta: null }; socks.push(ws); return ws; };
  return { ad, add };
}
const sdp = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n';
const offer = (dst, cid = 'dc_1') => JSON.stringify({ type: 'OFFER', dst, payload: { sdp: { type: 'offer', sdp }, type: 'data', connectionId: cid, label: cid, reliable: false, serialization: 'binary' } });
const P = (id, token = 'tok1234') => ({ key: 'peerjs', id, token, room: 'abc234' });

test('kiểm tra tham số vào phòng', async () => {
  const { checkJoin } = await load();
  assert.strictEqual(checkJoin(P('xqvn-abc234')), '');
  assert.strictEqual(checkJoin(P('xqvn-gq1w2e3r')), '');
  assert.strictEqual(checkJoin(P('xqvn-zzz999')), 'bad-id', 'chủ phòng phải có mã máy đúng bằng mã phòng');
  assert.strictEqual(checkJoin({ ...P('xqvn-abc234'), room: 'ab' }), 'bad-room');
  assert.strictEqual(checkJoin({ ...P('xqvn-abc234'), key: 'x' }), 'bad-key');
  assert.strictEqual(checkJoin(P('xqvn-abc234', 'a')), 'bad-token');
});

test('vào phòng, chuyển lời mời kèm mã người gửi, báo EXPIRE khi không có người nhận', async () => {
  const { onConnect, onMessage } = await load();
  const { ad, add } = fakeRoom();
  const h = add(), g = add();
  assert.ok(onConnect(ad, h, P('xqvn-abc234'), 0));
  assert.ok(onConnect(ad, g, P('xqvn-gguest1'), 0));
  assert.deepStrictEqual(h.got[0], { type: 'OPEN', payload: { relay: 1, watch: 1, proto: 1 } });
  onMessage(ad, g, offer('xqvn-abc234'), 10);
  assert.strictEqual(h.got[1].type, 'OFFER'); assert.strictEqual(h.got[1].src, 'xqvn-gguest1');
  onMessage(ad, g, offer('xqvn-khongco'), 20);
  assert.deepStrictEqual(g.got.pop(), { type: 'EXPIRE', src: 'xqvn-khongco', dst: 'xqvn-gguest1' });
  onMessage(ad, g, JSON.stringify({ type: 'RELAY', dst: 'xqvn-abc234', payload: { d: '{"t":"move"}' } }), 30);
  assert.deepStrictEqual(h.got.pop().payload, { d: '{"t":"move"}' });
  onMessage(ad, g, '{"type":"HEARTBEAT"}', 40);
  assert.deepStrictEqual(g.got.pop(), { type: 'HEARTBEAT' });
});

test('trùng mã máy: khác thẻ thì bị từ chối, cùng thẻ (nối lại) thì thay kết nối cũ và không báo rời phòng', async () => {
  const { onConnect, onClose } = await load();
  const { ad, add } = fakeRoom();
  const h = add(), g = add();
  onConnect(ad, h, P('xqvn-abc234', 'aaaa1111'), 0); onConnect(ad, g, P('xqvn-gguest1'), 0);
  const fake = add();
  assert.strictEqual(onConnect(ad, fake, P('xqvn-abc234', 'bbbb2222'), 0), false);
  assert.strictEqual(fake.got[0].type, 'ID-TAKEN');
  const h2 = add();
  assert.ok(onConnect(ad, h2, P('xqvn-abc234', 'aaaa1111'), 0));
  assert.strictEqual(h.open, false, 'kết nối cũ của chủ phòng bị thay');
  onClose(ad, h, h.meta);
  assert.ok(!g.got.some(m => m.type === 'LEAVE'), 'chủ phòng vẫn còn (kết nối mới) nên không báo rời phòng');
  onClose(ad, h2, h2.meta); h2.open = false;
  assert.deepStrictEqual(g.got.pop(), { type: 'LEAVE', src: 'xqvn-abc234' });
});

test('phòng tối đa 3 kết nối; tin sai dạng, quá lớn hoặc gửi dồn quá nhanh thì bị ngắt', async () => {
  const { onConnect, onMessage, LIMITS } = await load();
  const { ad, add } = fakeRoom();
  const a = add(), b = add(), c = add(), d = add();
  onConnect(ad, a, P('xqvn-abc234'), 0); onConnect(ad, b, P('xqvn-gb1'), 0); onConnect(ad, c, P('xqvn-gc1'), 0);
  assert.strictEqual(onConnect(ad, d, P('xqvn-gd1'), 0), false);
  assert.deepStrictEqual(d.got[0], { type: 'ERROR', payload: { msg: 'room-full' } });
  onMessage(ad, c, JSON.stringify({ type: 'OFFER', dst: 'xqvn-abc234', payload: { sdp: {} } }), 1);
  assert.strictEqual(c.closed.reason, 'bad-message', 'lời mời thiếu trường như PeerJS');
  onMessage(ad, b, 'x'.repeat(LIMITS.msgBytes + 1), 1);
  assert.strictEqual(b.closed.reason, 'too-big');
  // Gửi dồn: 60 tin đầu được, tin thứ 61 trong cùng lúc bị ngắt
  for (let i = 0; i < LIMITS.burst; i++) onMessage(ad, a, JSON.stringify({ type: 'RELAY', dst: 'xqvn-nobody', payload: { d: '{}' } }), 100);
  assert.ok(a.open);
  onMessage(ad, a, JSON.stringify({ type: 'RELAY', dst: 'xqvn-nobody', payload: { d: '{}' } }), 100);
  assert.strictEqual(a.closed.reason, 'rate-limit');
});

test('tin ván cờ qua máy chủ quá dài thì bị từ chối', async () => {
  const { onConnect, onMessage, LIMITS } = await load();
  const { ad, add } = fakeRoom();
  const a = add(), b = add();
  onConnect(ad, a, P('xqvn-abc234'), 0); onConnect(ad, b, P('xqvn-gb1'), 0);
  onMessage(ad, b, JSON.stringify({ type: 'RELAY', dst: 'xqvn-abc234', payload: { d: 'x'.repeat(LIMITS.relayBytes + 1) } }), 1);
  assert.strictEqual(b.closed.reason, 'bad-message');
});

test('người xem: vào riêng (không tính vào chỗ người chơi), chủ phòng được báo số người xem và phát thế cờ tới họ', async () => {
  const { onConnect, onMessage, onClose, LIMITS } = await load();
  const { ad, add } = fakeRoom();
  const h = add(), g = add(), x = add();
  onConnect(ad, h, P('xqvn-abc234'), 0); onConnect(ad, g, P('xqvn-gb1'), 0); onConnect(ad, x, P('xqvn-gc1'), 0);
  const w1 = add();
  assert.ok(onConnect(ad, w1, P('xqvn-wv1'), 0), 'phòng đủ 3 người chơi vẫn nhận người xem');
  assert.deepStrictEqual(w1.got[0], { type: 'OPEN', payload: { relay: 1, watch: 1, proto: 1 } });
  assert.deepStrictEqual(h.got.pop(), { type: 'WATCH', payload: { n: 1, src: 'xqvn-wv1' } });
  // chủ phòng phát thế cờ: người xem nhận, khách không nhận
  const gBefore = g.got.length;
  onMessage(ad, h, JSON.stringify({ type: 'CAST', payload: { d: '{"t":"snap"}' } }), 1);
  assert.deepStrictEqual(w1.got.pop(), { type: 'CAST', src: 'xqvn-abc234', payload: { d: '{"t":"snap"}' } });
  assert.strictEqual(g.got.length, gBefore);
  // gửi riêng cho một người xem
  const w2 = add(); onConnect(ad, w2, P('xqvn-wv2'), 0);
  onMessage(ad, h, JSON.stringify({ type: 'CAST', payload: { d: 'x', to: 'xqvn-wv2' } }), 2);
  assert.strictEqual(w2.got.pop().payload.d, 'x'); assert.notStrictEqual(w1.got[w1.got.length - 1].payload.d, 'x');
  // khách không được phát thế cờ; người xem không gửi được gì cho người chơi
  onMessage(ad, w1, JSON.stringify({ type: 'RELAY', dst: 'xqvn-abc234', payload: { d: '{}' } }), 3);
  assert.ok(!h.got.some(m => m.type === 'RELAY'));
  onMessage(ad, g, JSON.stringify({ type: 'CAST', payload: { d: 'x' } }), 4);
  assert.strictEqual(g.closed.reason, 'bad-message');
  // người xem rời: chủ phòng được báo, khách không nhận LEAVE
  w2.open = false; onClose(ad, w2, w2.meta);
  assert.deepStrictEqual(h.got.pop(), { type: 'WATCH', payload: { n: 1, src: '' } });
  assert.ok(!x.got.some(m => m.type === 'LEAVE' && m.src === 'xqvn-wv2'));
  // giới hạn người xem
  for (let i = 1; i < LIMITS.watchers; i++) onConnect(ad, add(), P('xqvn-wz' + i), 0);
  const over = add();
  assert.strictEqual(onConnect(ad, over, P('xqvn-wover'), 0), false);
  assert.deepStrictEqual(over.got[0], { type: 'ERROR', payload: { msg: 'watch-full' } });
});
