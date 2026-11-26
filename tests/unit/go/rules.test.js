// [CỜ VÂY] Kiểm tra lõi luật cờ vây (src/go/core/go.js): ăn quân, tự sát, kiếp và siêu kiếp, đếm điểm kiểu Trung Quốc,
// đoán quân chết, SGF, bộ giải bắt quân (thang), máy chơi, cờ bắt quân.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../../../src/go/core/go.js');
const B = rows => '9 b 7.5 ' + rows.join('/');
const play = (p, names) => names.forEach(s => { const m = p.parse(s); assert.ok(m, 'nước ' + s + ' phải hợp lệ'); p.make(m); });

test('bàn trống: 81 điểm + bỏ lượt; FEN đi một vòng không đổi', () => {
  for (const n of G.SIZES) {
    const p = G.Pos.fromFen(G.emptyFen(n));
    assert.equal(p.legalMoves().length, n * n + 1);
    assert.equal(G.Pos.fromFen(p.fen()).fen(), p.fen());
  }
  assert.equal(G.Pos.fromFen(G.START_FEN).pointOf('A1'), 72);
  assert.equal(G.Pos.fromFen(G.START_FEN).notation(1), 'A9');
  assert.equal(G.Pos.fromFen(G.emptyFen(19)).notation(19), 'T19');   // không có chữ I
});

test('ăn quân, đi lại (unmake) trả đúng thế cờ và số quân bị ăn', () => {
  const f = B(['.........', '.........', '.........', '....x....', '...xo....', '....x....', '.........', '.........', '.........']);
  const p = G.Pos.fromFen(f);
  play(p, ['F5']);
  assert.equal(p.at(p.pointOf('E5')), -1);
  assert.deepEqual(p.caps, [1, 0]);
  p.unmake();
  assert.equal(p.fen(), f);
  assert.deepEqual(p.caps, [0, 0]);
  // ăn cả nhóm hai quân
  const q = G.Pos.fromFen(B(['.........', '.........', '.........', '...xx....', '..xoo....', '...xx....', '.........', '.........', '.........']));
  play(q, ['F5']);
  assert.deepEqual(q.caps, [2, 0]);
});

test('cấm tự sát, nhưng được đặt vào chỗ hết khí nếu nước đó ăn quân', () => {
  const p = G.Pos.fromFen('9 w 7.5 ' + ['.........', '.........', '.........', '....x....', '...x.x...', '....x....', '.........', '.........', '.........'].join('/'));
  assert.equal(p.parse('E5'), 0);
  const q = G.Pos.fromFen(B(['.........', '.........', '.........', '...xo....', '..xo.o...', '...xo....', '.........', '.........', '.........']));
  assert.ok(q.parse('E5'));   // Đen vào E5 tưởng hết khí nhưng ăn được D5
});

test('kiếp: không được ăn lại ngay; đánh chỗ khác một lượt thì được', () => {
  const p = G.Pos.fromFen(B(['.........', '.........', '.........', '...xo....', '..xo.o...', '...xo....', '.........', '.........', '.........']));
  play(p, ['E5']);
  assert.deepEqual(p.caps, [1, 0]);
  assert.equal(p.parse('D5'), 0);
  play(p, ['A1', 'A9']);
  assert.ok(p.parse('D5'));
});

test('siêu kiếp: không được tạo lại toàn bộ thế cờ đã có', () => {
  // Sau khi Trắng ăn lại kiếp (D5) và hai bên bỏ lượt, Đen ăn lại ở E5 là nước hợp lệ (thế cờ mới vì số lượt khác),
  // còn ngay sau khi ăn thì Trắng không được tái lập thế cờ cũ.
  const p = G.Pos.fromFen(B(['.........', '.........', '.........', '...xo....', '..xo.o...', '...xo....', '.........', '.........', '.........']));
  const before = p.key();
  play(p, ['E5']);
  assert.ok(p.hist.has(before));
  assert.equal(p.isLegal(p.pointOf('D5') + 1), false);
});

test('đếm điểm kiểu Trung Quốc: quân + đất, điểm bù cho Trắng, quân chết tính cho bên kia', () => {
  const p = G.Pos.fromFen('5 b 0.5 ..xo./..xo./..xo./..xo./..xo.');
  const s = p.score();
  assert.equal(s.black, 15); assert.equal(s.white, 10.5); assert.equal(s.winner, 0);
  // một quân Đen chết trong đất Trắng
  const q = G.Pos.fromFen('5 b 0.5 ..xo./..xo./..xox/..xo./..xo.');
  const dead = new Set([q.pointOf('E3')]);
  assert.equal(q.score(dead).white, 10.5);
  assert.equal(q.score().white, 5.5);   // không đánh dấu chết: cột E không thuộc ai
  assert.match(q.resultText(dead), /^Đen thắng 4,5 điểm/);
});

test('đoán quân chết: quân lẻ nằm sâu trong vùng đối phương', () => {
  const p = G.Pos.fromFen(B(['oooooo...', 'o....o...', 'o.x..o...', 'o....o...', 'oooooo...', '.........', 'xxxxxxxxx', '.........', '.........']));
  const g = G.guessDead(p, 200);
  assert.ok(g.dead.has(p.pointOf('C7')));
  assert.ok(!g.dead.has(p.pointOf('A3')));
});

test('SGF: ghi rồi đọc lại đúng nước và thế bắt đầu', () => {
  const p = G.Pos.fromFen(G.emptyFen(13));
  const mv = []; ['D4', 'K10', 'pass', 'C3'].forEach(s => { const m = p.parse(s); mv.push(m); p.make(m); });
  const sgf = G.toSgf(G.emptyFen(13), mv, { RE: 'W+R' });
  assert.match(sgf, /SZ\[13\]/); assert.match(sgf, /RU\[Chinese\]/);
  const r = G.fromSgf(sgf);
  assert.equal(r.startFen, G.emptyFen(13));
  assert.deepEqual(r.moves, mv);
  assert.throws(() => G.fromSgf('(;SZ[9];B[ee];W[ee])'));   // đặt chồng quân
});

test('bộ giải bắt quân: thang (không có quân chặn) bắt được; có quân chặn cả hai đường thì không', () => {
  // Trắng E5 có 2 khí (E4, F5), Đen ở E6, D5, F4: Đen đánh F5 rồi đuổi thang xuống góc dưới trái
  const rows = ['.........', '.........', '.........', '....x....', '...xo....', '.....x...', '.........', '.........', '.........'];
  const p = G.Pos.fromFen(B(rows)), t = p.pointOf('E5');
  assert.ok(G.captureLength(p, t, 14) > 2, 'thang phải bắt được');
  assert.ok(G.captureMoves(p, t, 14).map(m => p.notation(m)).includes('F5'));
  const r2 = rows.slice(); r2[7] = '.o.......'; r2[1] = '.......o.';   // quân Trắng ở B2 và H8 chặn cả hai đường thang
  const q = G.Pos.fromFen(B(r2));
  assert.equal(G.captureLength(q, q.pointOf('E5'), 10), 0);
});

test('máy chơi: luôn đi nước hợp lệ; ăn ngay nhóm đang bị "atari"', () => {
  const S = new G.Searcher();
  // nhóm 3 quân Trắng D5-E5-F5 chỉ còn một khí ở G5
  const p = G.Pos.fromFen(B(['.........', '.........', '.........', '...xxx...', '..xooo...', '...xxx...', '.........', '.........', '.........']));
  const r = S.search(p, { playouts: 800, seed: 7 });
  assert.equal(p.notation(r.move), 'G5');
  const e = G.Pos.fromFen(G.START_FEN), r2 = S.search(e, { playouts: 200, seed: 3 });
  assert.ok(e.isLegal(r2.move));
});

test('cờ bắt quân: ăn được quân là kết thúc, người ăn thắng', () => {
  const p = G.Pos.fromFen(B(['.........', '.........', '.........', '....x....', '...xo....', '....x....', '.........', '.........', '.........']) + ' cg');
  assert.ok(p.cg);
  play(p, ['F5']);
  assert.equal(p.ended, 1);   // 1 + bên ăn (Đen = 0)
  assert.deepEqual(p.legalMoves(), []);
});
