// Gộp bài chiếu hết vào app: data/xiangqi/puzzles.json
// Dùng:  node tools/xiangqi/build_puzzles.js <raw.json từ gen_puzzles.js> [--append]
//   --append: giữ nguyên các bài đang có (không đổi thế cờ), thêm bài mới; không có --append thì thay toàn bộ.
// Xoay bàn cờ cho 2/3 số bài mới để có cả bài Đen đi; kiểm tra lại từng bài (đúng n nước, chỉ một nước đầu đúng);
// sắp theo số nước rồi đánh số lại.
const fs = require('fs');
const XQ = require('../../src/xiangqi/core/xq.js');
const OUT = __dirname + '/../../data/xiangqi/puzzles.json';
const raw = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/puzzles_raw.json', 'utf8'));
const append = process.argv.includes('--append');
const old = append && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
const items = old.map(p => ({ fen: p.fen, n: p.n, old: true }));
let flip = 0;
for (const p of raw) {
  // xen kẽ: Đỏ chiếu / Đen chiếu (2/3 bài là Đen đi)
  items.push({ fen: flip % 3 !== 0 ? XQ.rotateFen(p.fen) : p.fen, n: p.n });
  flip++;
}
const seen = new Set(), out = [];
for (const p of items) {
  if (seen.has(p.fen)) continue;
  seen.add(p.fen);
  const pos = XQ.Pos.fromFen(p.fen);
  const len = XQ.mateLength(pos, 7), firsts = XQ.mateFirstMoves(pos, p.n);
  if (len !== p.n || firsts.length !== 1) { console.error('LỖI', p.fen, len, firsts.length); process.exit(1); }
  out.push({ fen: p.fen, n: p.n, side: pos.side, sol: pos.notation(firsts[0]), old: !!p.old });
}
// sắp theo số nước; cùng số nước thì bài cũ trước, bài mới sau (giữ thứ tự sinh)
out.sort((a, b) => a.n - b.n || (b.old - a.old));
const res = out.map((p, i) => ({ id: i + 1, fen: p.fen, n: p.n, side: p.side, sol: p.sol }));
fs.writeFileSync(OUT, JSON.stringify(res));
const by = {}; res.forEach(o => { by[o.n] = (by[o.n] || 0) + 1; });
console.log('tổng', res.length, by, 'bên Đen đi:', res.filter(o => o.side === 1).length, append ? '(giữ ' + old.length + ' bài cũ)' : '');
