// Luật lặp thế: chiếu dai, đuổi dai (Pos.repCycle / Pos.repetitionVerdict trong src/xiangqi/core/xq.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const XQ = require('../../../src/xiangqi/core/xq.js');

// Đi một nước theo ô (hàng, cột); hàng 0 là phía Đen. Nước phải hợp lệ.
function go(p, r1, c1, r2, c2) {
  const m = (XQ.sq(r1, c1) << 7) | XQ.sq(r2, c2);
  assert.ok(p.isLegal(m), 'nước không hợp lệ: ' + [r1, c1, r2, c2].join(','));
  p.make(m);
}
// Lặp một vòng 4 nước `times` lần; trả về phán quyết sau mỗi vòng.
function loop(p, cyc, times) {
  const out = [];
  for (let i = 0; i < times; i++) { for (const mv of cyc) go(p, ...mv); out.push(p.repetitionVerdict()); }
  return out;
}

test('chiếu dai: bên chiếu liên tục bị xử thua khi thế lặp lại ba lần', () => {
  // Tướng Đen ở e9 (hàng 0 cột 4), Xe Đỏ ở hàng 1 cột 0, Tướng Đỏ ở hàng 9 cột 3; Đỏ đi.
  const p = XQ.Pos.fromFen('4k4/R8/9/9/9/9/9/9/9/3K5 w');
  const v = loop(p, [[1, 0, 0, 0], [0, 4, 1, 4], [0, 0, 1, 0], [1, 4, 0, 4]], 2);
  assert.equal(v[0], null);                       // mới lặp lần hai: chưa phân xử
  assert.deepEqual(p.repCycle().kinds, ['check', '']);
  assert.deepEqual(v[1], { result: 'lose', side: 0, why: 'check' });
});

test('đuổi dai: Mã đuổi Xe liên tục bị xử thua', () => {
  // Xe Đen chạy giữa (3,3) và (3,8); Mã Đỏ đi giữa (4,6) và (5,4), mỗi nước đều tạo thế ăn Xe.
  const p = XQ.Pos.fromFen('3k5/9/9/3r5/6N2/9/9/9/9/4K4 w');
  const v = loop(p, [[4, 6, 5, 4], [3, 3, 3, 8], [5, 4, 4, 6], [3, 8, 3, 3]], 2);
  assert.equal(v[0], null);
  assert.deepEqual(p.repCycle().kinds, ['chase', '']);
  assert.deepEqual(v[1], { result: 'lose', side: 0, why: 'chase' });
});

test('hai bên đi nhàn (không chiếu, không đuổi): lặp ba lần là hòa', () => {
  const p = XQ.Pos.fromFen('3k5/9/9/9/9/9/9/9/9/4K4 w');
  const v = loop(p, [[9, 4, 8, 4], [0, 3, 1, 3], [8, 4, 9, 4], [1, 3, 0, 3]], 2);
  assert.equal(v[0], null);
  assert.deepEqual(v[1], { result: 'draw' });
});

test('đuổi Tốt chưa qua sông không tính là đuổi', () => {
  // Xe Đỏ đi lại giữa (2,0) và (2,8)… tạo thế ăn Tốt Đen chưa qua sông ở (3,0)/(3,8): không phạm luật.
  const p = XQ.Pos.fromFen('3k5/9/R8/p7p/9/9/9/9/9/4K4 w');
  const v = loop(p, [[2, 0, 2, 8], [0, 3, 1, 3], [2, 8, 2, 0], [1, 3, 0, 3]], 2);
  assert.deepEqual(v[1], { result: 'draw' });
});

test('chặn nước chiếu dai thứ 4: ba nước chiếu lặp lại được đi, nước thứ tư bị chặn, nước khác vẫn đi được', () => {
  const p = XQ.Pos.fromFen('4k4/R8/9/9/9/9/9/9/9/3K5 w');
  const mv = (a, b, c, d) => (XQ.sq(a, b) << 7) | XQ.sq(c, d);
  const cyc = [[1, 0, 0, 0], [0, 4, 1, 4], [0, 0, 1, 0], [1, 4, 0, 4]];
  for (const x of cyc) { assert.equal(p.perpetualBlocked(mv(...x), 3), ''); go(p, ...x); }   // chiếu 1, 2
  assert.equal(p.perpetualBlocked(mv(1, 0, 0, 0), 3), '');                                     // chiếu 3: còn được
  go(p, 1, 0, 0, 0);
  assert.deepEqual(p.perpetualInfo(0, 3), { kind: 'check', streak: 3 });
  go(p, 0, 4, 1, 4);
  assert.equal(p.perpetualBlocked(mv(0, 0, 1, 0), 3), 'check');                                // chiếu 4: bị chặn
  assert.equal(p.perpetualBlocked(mv(0, 0, 2, 0), 3), '');                                     // nước khác: được
  // Đen chỉ chạy Tướng (không chiếu, không đuổi) thì không bao giờ bị chặn
  assert.equal(p.perpetualBlocked(mv(0, 0, 2, 0), 3), '');
});

test('đuổi dai cũng bị chặn ở nước thứ tư', () => {
  const p = XQ.Pos.fromFen('3k5/9/9/3r5/6N2/9/9/9/9/4K4 w');
  const mv = (a, b, c, d) => (XQ.sq(a, b) << 7) | XQ.sq(c, d);
  const cyc = [[4, 6, 5, 4], [3, 3, 3, 8], [5, 4, 4, 6], [3, 8, 3, 3]];
  for (const x of cyc) go(p, ...x);
  go(p, 4, 6, 5, 4); go(p, 3, 3, 3, 8);
  assert.equal(p.perpetualBlocked(mv(5, 4, 4, 6), 3), 'chase');
});

test('chiếu liên tục nhưng thế cờ không lặp lại thì không bị chặn', () => {
  // Xe Đỏ chiếu từ nhiều hàng khác nhau, Tướng Đen chạy: không có thế nào lặp lại
  const p = XQ.Pos.fromFen('4k4/R8/9/9/9/9/9/9/9/3K5 w');
  const mv = (a, b, c, d) => (XQ.sq(a, b) << 7) | XQ.sq(c, d);
  go(p, 1, 0, 0, 0); go(p, 0, 4, 1, 4); go(p, 0, 0, 1, 0); go(p, 1, 4, 2, 4);
  assert.equal(p.perpetualBlocked(mv(1, 0, 2, 0), 1), '');   // chiếu lần 3 nhưng thế mới: không chặn dù giới hạn là 1
});

test('phân xử không làm thay đổi thế cờ và lịch sử nước đi', () => {
  const p = XQ.Pos.fromFen('4k4/R8/9/9/9/9/9/9/9/3K5 w');
  loop(p, [[1, 0, 0, 0], [0, 4, 1, 4], [0, 0, 1, 0], [1, 4, 0, 4]], 2);
  const f = p.fen(), n = p.mv.length, lo = p.lo;
  p.repetitionVerdict(); p.repCycle();
  assert.equal(p.fen(), f); assert.equal(p.mv.length, n); assert.equal(p.lo, lo);
});

test('engine tự viết bỏ qua các nước bị cấm (opts.avoid)', () => {
  const p = XQ.Pos.fromFen(XQ.START_FEN);
  const S = new XQ.Searcher();
  const first = S.search(p, { maxDepth: 2, timeMs: 500 }).move;
  const second = S.search(p, { maxDepth: 2, timeMs: 500, avoid: [first] }).move;
  assert.ok(second && second !== first);
  // bỏ hết mọi nước thì vẫn trả về một nước hợp lệ
  const all = p.legalMoves();
  assert.ok(all.indexOf(S.search(p, { maxDepth: 1, timeMs: 300, avoid: all }).move) >= 0);
});
