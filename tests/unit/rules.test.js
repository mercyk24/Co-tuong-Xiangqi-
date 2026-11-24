// Kiểm tra lõi luật cờ (src/core/xq.js): sinh nước đi, ký hiệu, FEN, giải chiếu hết.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const XQ = require('../../src/core/xq.js');

test('perft từ thế ban đầu khớp số liệu chuẩn (44 / 1920 / 79666 / 3290240)', () => {
  const p = XQ.Pos.fromFen(XQ.START_FEN);
  assert.deepEqual([1, 2, 3, 4].map(d => p.perft(d)), [44, 1920, 79666, 3290240]);
});

test('FEN đọc rồi ghi lại không đổi, kể cả sau khi đi và lùi nước', () => {
  const p = XQ.Pos.fromFen(XQ.START_FEN);
  const f0 = p.fen();
  assert.equal(XQ.Pos.fromFen(f0).fen(), f0);
  const ms = p.legalMoves();
  for (const m of ms) { p.make(m); assert.equal(XQ.Pos.fromFen(p.fen()).fen(), p.fen()); p.unmake(); }
  assert.equal(p.fen(), f0);
});

test('ký hiệu nước đi: parse(notation(m)) === m cho mọi nước hợp lệ trong 40 ván ngẫu nhiên', () => {
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let checked = 0;
  for (let g = 0; g < 40; g++) {
    const p = XQ.Pos.fromFen(XQ.START_FEN);
    for (let ply = 0; ply < 60; ply++) {
      const ms = p.legalMoves();
      if (!ms.length) break;
      for (const m of ms) {
        const n = p.notation(m);
        assert.equal(p.parse(n), m, 'thế ' + p.fen() + ' nước ' + XQ.mvStr(m) + ' ghi là ' + n);
        checked++;
      }
      p.make(ms[rnd(ms.length)]);
    }
  }
  assert.ok(checked > 10000);
});

test('ký hiệu quen thuộc: Pháo đầu và Mã đáp', () => {
  const p = XQ.Pos.fromFen(XQ.START_FEN);
  const m1 = p.parse('炮二平五');
  assert.ok(m1 > 0);
  assert.equal(XQ.mvStr(m1), 'h2e2');
  p.make(m1);
  const m2 = p.parse('馬8進7');
  assert.ok(m2 > 0);
  assert.equal(p.notation(m2), '馬8進7');
});

test('nhận ra chiếu hết và Tướng đối mặt', () => {
  // Bài chiếu hết 1 nước đầu tiên: đi đáp án thì bên kia hết nước và đang bị chiếu
  const z = require('../../data/puzzles.json').find(x => x.n === 1);
  const mate = XQ.Pos.fromFen(z.fen);
  mate.make(mate.parse(z.sol.split(' ')[0]));
  assert.equal(mate.legalMoves().length, 0);
  assert.equal(mate.inCheck(), true);
  assert.equal(mate.status(), 'mate');
  // Tướng không được ra cột đối mặt Tướng đối phương khi không có quân chắn
  const face = XQ.Pos.fromFen('4k4/9/9/9/9/9/9/9/9/3K5 w');
  const toE = face.legalMoves().map(XQ.mvStr).filter(u => u.endsWith('e0'));
  assert.deepEqual(toE, []);
});
