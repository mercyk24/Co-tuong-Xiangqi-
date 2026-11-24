const XQ = require('../src/core/xq.js');
const raw = JSON.parse(require('fs').readFileSync(process.argv[2] || '/tmp/puzzles_raw.json', 'utf8'));
raw.sort((a, b) => a.n - b.n);
const out = [];
let flip = 0;
for (const p of raw) {
  let fen = p.fen;
  // xen kẽ: Đỏ chiếu / Đen chiếu (người dùng chủ yếu chơi Đen nên bài Đen đi ưu tiên nhiều hơn)
  if (flip % 3 !== 0) fen = XQ.rotateFen(fen);
  flip++;
  const pos = XQ.Pos.fromFen(fen);
  const len = XQ.mateLength(pos, 7);
  const firsts = XQ.mateFirstMoves(pos, p.n);
  if (len !== p.n || firsts.length !== 1) { console.error('LỖI sau khi xoay', fen, len, firsts.length); process.exit(1); }
  out.push({ id: out.length + 1, fen, n: p.n, side: pos.side, sol: pos.notation(firsts[0]) });
}
require('fs').writeFileSync(__dirname + '/../data/puzzles.json', JSON.stringify(out));
const by = {}; out.forEach(o => by[o.n] = (by[o.n] || 0) + 1);
console.log('tổng', out.length, by, 'bên Đen đi:', out.filter(o => o.side === 1).length);
console.log(out.slice(0, 3));
