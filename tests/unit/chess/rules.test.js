// Lõi CỜ VUA (src/chess/core/chess.js): luật đi (perft với các con số chuẩn), SAN, luật hòa, engine.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const CH = require('../../../src/chess/core/chess.js');

// Số thế ở từng độ sâu, đối chiếu với số liệu chuẩn (chessprogramming.org/Perft_Results)
const PERFT = [
  [CH.START_FEN, [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],   // "Kiwipete": nhập thành, ep, phong cấp
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],                          // ep bị ghim ngang
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],          // phong cấp kèm ăn
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]]
];
for (const [fen, exp] of PERFT) {
  test('perft ' + fen.split(' ')[0].slice(0, 24) + '…', () => {
    const p = CH.Pos.fromFen(fen), f0 = p.fen();
    assert.deepEqual(exp.map((_, i) => CH.perft(p, i + 1)), exp);
    assert.equal(p.fen(), f0, 'make/unmake phải trả lại đúng thế cũ');
  });
}

test('đi rồi lùi ngẫu nhiên: mã băm và điểm luôn khớp với dựng lại từ FEN', () => {
  for (let g = 0; g < 60; g++) {
    const p = CH.Pos.fromFen(CH.START_FEN);
    for (let i = 0; i < 100; i++) {
      const ms = p.legalMoves(); if (!ms.length) break;
      p.make(ms[(Math.random() * ms.length) | 0]);
      const q = CH.Pos.fromFen(p.fen());
      assert.ok(q.lo === p.lo && q.hi === p.hi && q.mg === p.mg && q.eg === p.eg, p.fen());
    }
  }
});

test('ký hiệu SAN: nước thường, ăn quân, nhập thành, phong cấp, chiếu, chiếu hết, phân biệt quân', () => {
  const p = CH.Pos.fromFen(CH.START_FEN);
  const play = list => list.map(s => { const m = p.parseSan(s); assert.ok(m, 'không đọc được ' + s); const n = p.san(m); p.make(m); return n; });
  assert.deepEqual(play(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O']), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O']);
  // Chiếu hết kiểu "học trò"
  const q = CH.Pos.fromFen(CH.START_FEN);
  for (const s of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6']) q.make(q.parseSan(s));
  assert.equal(q.san(q.parseSan('Qxf7')), 'Qxf7#');
  // Hai Mã cùng đến một ô: phải ghi cột
  const r = CH.Pos.fromFen('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1');
  assert.equal(r.san(r.parseSan('Nbd2')), 'Nbd2');
  assert.equal(r.san(r.parseSan('Nfd2')), 'Nfd2');
  assert.equal(r.san(r.parseSan('Nc3')), 'Nc3');
  // Hai Xe cùng cột: phải ghi hàng
  const r2 = CH.Pos.fromFen('4k3/8/R7/8/8/8/R7/4K3 w - - 0 1');
  assert.equal(r2.san(r2.parseSan('R6a4')), 'R6a4');
  // Phong cấp kèm ăn và chiếu
  const pr = CH.Pos.fromFen('3r2k1/4P3/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(pr.san(pr.parseSan('exd8=Q')), 'exd8=Q+');
  assert.equal(pr.san(pr.parse('e7d8n')), 'exd8=N');
  // Bắt tốt qua đường
  const ep = CH.Pos.fromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  assert.equal(ep.san(ep.parse('e5d6')), 'exd6');
  ep.make(ep.parse('e5d6'));
  assert.equal(ep.fen().split(' ')[0], '4k3/8/3P4/8/8/8/8/4K3');
});

test('nhập thành bị cấm khi Vua bị chiếu hoặc đi qua ô bị khống chế', () => {
  assert.equal(CH.Pos.fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1').legalMoves().map(CH.mvStr).filter(u => u === 'e1g1' || u === 'e1c1').length, 2);
  assert.equal(CH.Pos.fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1').parse('e1g1') !== 0, true);
  assert.equal(CH.Pos.fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1').parse('e1g1') !== 0, true);
  assert.equal(CH.Pos.fromFen('4k3/8/8/8/8/5r2/8/R3K2R w KQ - 0 1').parse('e1g1'), 0);       // f1 bị Xe f3 khống chế: Vua đi qua ô bị khống chế
  assert.equal(CH.Pos.fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1').parse('e1g1') !== 0, true);
  assert.equal(CH.Pos.fromFen('4k3/8/8/8/8/8/8/R3K1rR w KQ - 0 1').parse('e1g1'), 0);       // Vua bị chiếu
  assert.equal(CH.Pos.fromFen('4k3/8/8/8/8/8/8/R3K2R w - - 0 1').parse('e1g1'), 0);         // mất quyền
  assert.equal(CH.Pos.fromFen('4k3/8/8/8/8/8/8/Rn2K2R w KQ - 0 1').parse('e1c1'), 0);       // b1 có quân
  assert.ok(CH.Pos.fromFen('4k3/8/8/8/8/8/1r6/R3K2R w KQ - 0 1').parse('e1c1'));            // b1 bị khống chế vẫn nhập thành được
});

test('luật kết thúc: chiếu hết, hết nước đi, không đủ quân, 50 nước, lặp ba lần', () => {
  assert.deepEqual(CH.Pos.fromFen('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1').status(), { result: 'mate', winner: 0 });
  assert.deepEqual(CH.Pos.fromFen('7k/8/6QK/8/8/8/8/8 b - - 0 1').status(), { result: 'stalemate', winner: -1 });
  assert.equal(CH.Pos.fromFen('8/8/4k3/8/8/3NK3/8/8 w - - 0 1').status().result, 'insufficient');
  assert.equal(CH.Pos.fromFen('8/8/4k3/8/3b4/4K3/5B2/8 w - - 0 1').status().result, 'insufficient');   // d4, f2: hai Tượng cùng màu ô
  assert.equal(CH.Pos.fromFen('8/8/4k3/8/2b5/4K3/5B2/8 w - - 0 1').status(), null);                   // c4, f2: khác màu ô, còn chơi
  assert.equal(CH.Pos.fromFen('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1').status(), null);
  assert.equal(CH.Pos.fromFen('8/8/4k3/8/8/4K3/4R3/8 w - - 100 80').status().result, 'fifty');
  const p = CH.Pos.fromFen(CH.START_FEN);
  for (let i = 0; i < 2; i++) for (const u of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) p.make(p.parse(u));
  assert.equal(p.repCount(), 3);
  assert.equal(p.status().result, 'repetition');
});

test('engine tự viết: thấy chiếu hết một nước, hai nước, và không bỏ Hậu', () => {
  const S = new CH.Searcher();
  const m1 = CH.Pos.fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  assert.equal(CH.mvStr(S.search(m1, { maxDepth: 3, timeMs: 2000 }).move), 'a1a8');
  const m2 = CH.Pos.fromFen('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
  assert.equal(CH.mvStr(S.search(m2, { maxDepth: 3, timeMs: 2000 }).move), 'h5f7');
  // Hậu Đen đang bị Tốt đe: phải chạy Hậu (hoặc đổi), không được để mất
  const hang = CH.Pos.fromFen('rnb1kbnr/pppp1ppp/8/4p3/3qP3/2P5/PP1P1PPP/RNBQKBNR b KQkq - 0 3');
  const r = S.search(hang, { maxDepth: 4, timeMs: 3000 });
  hang.make(r.move);
  const after = new CH.Searcher().search(hang, { maxDepth: 2, timeMs: 1000 });
  assert.ok(after.score < 400, 'để mất Hậu: ' + CH.mvStr(r.move));
  // bỏ qua nước bị cấm (opts.avoid)
  const first = S.search(CH.Pos.fromFen(CH.START_FEN), { maxDepth: 2, timeMs: 500 }).move;
  assert.notEqual(S.search(CH.Pos.fromFen(CH.START_FEN), { maxDepth: 2, timeMs: 500, avoid: [first] }).move, first);
});

test('FEN đọc rồi ghi lại giữ nguyên, kể cả quyền nhập thành và ô bắt tốt qua đường', () => {
  for (const f of ['rnbqkbnr/pp1ppppp/8/2pP4/8/8/PPP1PPPP/RNBQKBNR w KQkq c6 0 3', 'r3k2r/8/8/8/8/8/8/R3K2R b Kq - 5 20', CH.START_FEN]) {
    assert.equal(CH.Pos.fromFen(f).fen(), f);
  }
});
