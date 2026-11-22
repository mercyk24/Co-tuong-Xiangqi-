// Sinh bài chiếu hết liên tục (連將殺): bên đi chỉ dùng nước chiếu, chiếu hết trong n nước.
const XQ = require('./xq.js');
const { Pos, mateFirstMoves, mateLength } = XQ;
const ri = n => (Math.random() * n) | 0;
const pick = a => a[ri(a.length)];
const PAL_B = [[0,3],[0,4],[0,5],[1,3],[1,4],[1,5],[2,3],[2,4],[2,5]];
const ADV_B = [[0,3],[0,5],[1,4],[2,3],[2,5]];
const BIS_B = [[0,2],[0,6],[2,0],[2,4],[2,8],[4,2],[4,6]];
const ADV_R = [[9,3],[9,5],[8,4],[7,3],[7,5]];
const BIS_R = [[9,2],[9,6],[7,0],[7,4],[7,8],[5,2],[5,6]];
const PAL_R = [[7,3],[7,4],[7,5],[8,3],[8,4],[8,5],[9,3],[9,4],[9,5]];
const COMBOS = [['R','R'],['R','C'],['R','N'],['C','N'],['R','C','N'],['R','R','C'],['R','N','N'],['C','C','R'],['R','C','P'],['R','N','P'],['N','N','C'],['R','R','N'],['C','N','P'],['R','R'],['R','C','C'],['N','N','R','C']];

function randomFen(combo) {
  const g = Array.from({ length: 10 }, () => Array(9).fill(''));
  const free = (r, c) => g[r][c] === '';
  const put = (r, c, ch) => { g[r][c] = ch; };
  // Tướng Đen
  const [kr, kc] = pick(PAL_B); put(kr, kc, 'k');
  // Tướng Đỏ
  const [rr, rc] = pick(PAL_R); put(rr, rc, 'K');
  // Sĩ/Tượng Đen
  const na = ri(3), nb = ri(3);
  for (let i = 0; i < na; i++) { const [r, c] = pick(ADV_B); if (free(r, c)) put(r, c, 'a'); }
  for (let i = 0; i < nb; i++) { const [r, c] = pick(BIS_B); if (free(r, c)) put(r, c, 'b'); }
  // Quân phụ Đen
  const extra = 1 + ri(3);
  const bt = ['r', 'c', 'n', 'p', 'p', 'c', 'n', 'p'];
  for (let i = 0; i < extra; i++) {
    const t = pick(bt);
    let r, c;
    if (t === 'p') { r = 3 + ri(7); c = ri(9); if (r <= 4 && c % 2) continue; }
    else { r = ri(10); c = ri(9); }
    if (free(r, c)) put(r, c, t);
  }
  // Quân Đỏ tấn công
  for (const t of combo) {
    for (let k = 0; k < 20; k++) {
      const r = ri(10), c = ri(9);
      if (!free(r, c)) continue;
      if (t === 'P' && (r > 6 || (r >= 5 && c % 2))) continue;
      put(r, c, t); break;
    }
  }
  if (Math.random() < 0.5) { const [r, c] = pick(ADV_R); if (free(r, c)) put(r, c, 'A'); }
  if (Math.random() < 0.4) { const [r, c] = pick(BIS_R); if (free(r, c)) put(r, c, 'B'); }
  const rows = g.map(row => { let s = '', e = 0; for (const ch of row) { if (ch === '') e++; else { if (e) { s += e; e = 0; } s += ch; } } if (e) s += e; return s; });
  return rows.join('/') + ' w';
}

function legalStart(pos) {
  if (pos.inCheck(0) || pos.inCheck(1)) return false;
  // Vị trí hợp lệ về mặt nối: các quân không ở chỗ vô lý (tốt ở hàng nhà/ tượng sai chỗ đã được sinh đúng)
  return true;
}

function minimal(pos, n) {
  // Bỏ bất kỳ quân tấn công nào (xe, pháo, mã, tốt) thì chiếu hết trong n nước phải mất
  const b = pos.b;
  for (let s = 0; s < 90; s++) {
    const p = b[s];
    if (!p || (p >> 3) !== 0) continue;
    const t = p & 7;
    if (t === 5 || t === 3 || t === 4) continue;
    b[s] = 0;
    const p2 = Pos.fromFen(pos.fen().replace(/ .*/, '') + ' w'); // placeholder, replaced below
    b[s] = p;
  }
  return true;
}

function minimalByFen(fen, n) {
  const pos = Pos.fromFen(fen);
  for (let s = 0; s < 90; s++) {
    const p = pos.b[s];
    if (!p || (p >> 3) !== 0) continue;
    const t = p & 7;
    if (t === 5 || t === 3 || t === 4) continue;
    const q = Pos.fromFen(fen);
    // loại quân s
    const rowsArr = fen.split(' ')[0].split('/').map(r => { const a = []; for (const ch of r) { if (ch >= '0' && ch <= '9') for (let i = 0; i < +ch; i++) a.push(''); else a.push(ch); } return a; });
    rowsArr[(s / 9) | 0][s % 9] = '';
    const rows = rowsArr.map(row => { let st = '', e = 0; for (const ch of row) { if (ch === '') e++; else { if (e) { st += e; e = 0; } st += ch; } } if (e) st += e; return st; });
    const f2 = rows.join('/') + ' w';
    const q2 = Pos.fromFen(f2);
    if (q2.inCheck(0) || q2.inCheck(1)) continue;
    if (XQ.mateLength(q2, n) <= n) return false; // quân thừa
  }
  return true;
}

const want = { 1: 10, 2: 20, 3: 24, 4: 20, 5: 14, 6: 10 };
const have = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
const seen = new Set();
const t0 = Date.now();
const limitMs = +(process.argv[2] || 120000);
let tried = 0;
while (Date.now() - t0 < limitMs) {
  const combo = pick(COMBOS);
  const fen = randomFen(combo);
  tried++;
  let pos;
  try { pos = Pos.fromFen(fen); } catch (e) { continue; }
  if (!legalStart(pos)) continue;
  // tìm n nhỏ nhất ≤ 6
  let n = 0;
  for (let k = 1; k <= 6; k++) { if (XQ.canMate(pos, k)) { n = k; break; } }
  if (!n || have[n].length >= want[n]) continue;
  const firsts = mateFirstMoves(pos, n);
  if (firsts.length !== 1) continue;
  if (n >= 2 && !minimalByFen(fen, n)) continue;
  // Đen phải có ít nhất 1 quân ngoài tướng (đỡ trống trải) và thế không quá thưa
  const cnt = fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;
  if (cnt < 7) continue;
  const key = fen;
  if (seen.has(key)) continue;
  seen.add(key);
  have[n].push({ fen, n, first: pos.notation(firsts[0]) });
  console.error(`n=${n} ${have[n].length}/${want[n]}  tried=${tried}  ${fen}  ${pos.notation(firsts[0])}`);
  if (Object.keys(want).every(k => have[k].length >= want[k])) break;
}
console.error('done tried', tried, 'ms', Date.now() - t0, Object.keys(have).map(k => k + ':' + have[k].length).join(' '));
const out = [];
for (const k of Object.keys(have)) out.push(...have[k]);
require('fs').writeFileSync(process.argv[3] || '/tmp/puzzles_raw.json', JSON.stringify(out));
