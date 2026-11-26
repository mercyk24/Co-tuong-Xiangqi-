// Bước 2 của khai cuộc: kéo dài các nhánh đầu trong opening_tree.json thành những biến dài (đến 22 nước đi, cả hai bên),
// mỗi biến theo nước tốt nhất của Pikafish, kèm vài biến phụ khi Đỏ có nước thứ hai gần ngang.
// Dùng:  node gen_opening_lines.js <pikafish.exe> [opening_tree.json] [opening_lines.json] [movetime-ms=800]
// Chạy lại được: kết quả phân tích từng thế được lưu trong opening_lines_cache.json.
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const XQ = require('../../src/xiangqi/core/xq.js');
const exe = path.resolve(process.argv[2] || ''), treeFile = process.argv[3] || path.join(__dirname, '..', '..', 'data', 'xiangqi', 'opening_tree.json'), outFile = process.argv[4] || path.join(__dirname, '..', '..', 'data', 'xiangqi', 'opening_lines.json'), MT = +(process.argv[5] || 800);
if (!process.argv[2]) { console.error('Thiếu đường dẫn Pikafish.'); process.exit(1); }
const PLIES = 22, ALT_MARGIN = 30, STOP_CP = 300, ALT_PLIES = [2, 4];
const tree = JSON.parse(fs.readFileSync(treeFile, 'utf8'));
const cacheFile = path.join(path.dirname(outFile), 'opening_lines_cache.json');
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};

const eng = spawn(exe, [], { cwd: path.dirname(exe) });
let buf = '', waiters = [];
eng.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); waiters = waiters.filter(w => !w(l)); } });
const send = s => eng.stdin.write(s + '\n');
const until = (pred, col) => new Promise(r => waiters.push(l => { if (col) col(l); if (pred(l)) { r(); return true; } return false; }));
const info = l => { const m = l.match(/depth (\d+).* multipv (\d+) score (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?.* pv (.+)$/); return m ? { d: +m[1], k: +m[2], kind: m[3], v: +m[4], bound: m[5], pv: m[6].split(' ') } : null; };
const val = p => p.kind === 'mate' ? (p.v > 0 ? 100000 - p.v : -100000 - p.v) : p.v;
async function node(moves) {                    // trả về {cp, c:[{m,cp}]} theo góc nhìn bên đi
  const key = moves.join(' ');
  if (cache[key]) return cache[key];
  send('setoption name MultiPV value 3');
  send('position startpos' + (moves.length ? ' moves ' + key : ''));
  const best = {}; send('go movetime ' + MT);
  await until(l => l.startsWith('bestmove'), l => { const p = info(l); if (p && !p.bound) best[p.k] = p; });
  const lines = Object.values(best).sort((a, b) => a.k - b.k);
  const nd = lines.length ? { cp: val(lines[0]), c: lines.map(l => ({ m: l.pv[0], cp: val(l) })) } : { cp: 0, c: [] };
  cache[key] = nd; return nd;
}
let sinceSave = 0; const saveCache = () => fs.writeFileSync(cacheFile, JSON.stringify(cache));

(async () => {
  send('uci'); await until(l => l === 'uciok');
  send('setoption name Threads value 2'); send('setoption name Hash value 128'); send('isready'); await until(l => l === 'readyok');
  const root = tree[''];
  const pairs = [];
  for (const r of root.c.filter(x => root.c[0].cp - x.cp <= 70)) {
    const rn = tree[r.m]; if (!rn) continue;
    for (const b of rn.c.filter(x => rn.c[0].cp - x.cp <= 40).slice(0, 3)) pairs.push([r.m, b.m]);
  }
  console.log('Số cặp (nước đầu Đỏ, nước đáp Đen): ' + pairs.length);
  const lines = [], seen = new Set();
  async function follow(prefix) {                // kéo dài theo nước tốt nhất đến PLIES
    const mv = prefix.slice(); const cps = [], bests = [];
    // cp/best cho các thế trong prefix
    for (let i = 0; i < mv.length; i++) { const n = await node(mv.slice(0, i)); cps.push(n.cp); bests.push(n.c[0] ? n.c[0].m : ''); }
    while (mv.length < PLIES) {
      const n = await node(mv); cps.push(n.cp); bests.push(n.c[0] ? n.c[0].m : '');
      if (!n.c.length || Math.abs(n.cp) >= STOP_CP) break;
      mv.push(n.c[0].m);
    }
    if (mv.length === PLIES) { const n = await node(mv); cps.push(n.cp); bests.push(n.c[0] ? n.c[0].m : ''); }
    return { moves: mv, cps, bests };
  }
  const addLine = async (prefix, tag) => {
    const L = await follow(prefix);
    const p = XQ.Pos.fromFen(XQ.START_FEN); for (const u of L.moves) { const m = p.legalMoves().find(x => XQ.mvStr(x) === u); if (m === undefined) return; p.make(m); }
    const k = p.fen().split(' ').slice(0, 2).join(' ');
    if (seen.has(k) || L.moves.length < 8) return; seen.add(k);
    L.tag = tag; lines.push(L);
    fs.writeFileSync(outFile, JSON.stringify(lines));
    if (++sinceSave % 3 === 0) saveCache();
    console.log(`biến ${lines.length}: ${L.moves.length} nước (${tag})`);
  };
  for (const [r, b] of pairs) {
    await addLine([r, b], 'chính');
    for (const p of ALT_PLIES) {                   // biến phụ: Đỏ chọn nước thứ hai ở ply p
      const main = (await follow([r, b])).moves; if (main.length <= p) continue;
      const n = await node(main.slice(0, p));
      const alt = n.c.slice(1).find(x => n.c[0].cp - x.cp <= ALT_MARGIN && x.m !== main[p]);
      if (alt) await addLine(main.slice(0, p).concat([alt.m]), 'phụ@' + p);
    }
  }
  saveCache();
  console.log('Xong. ' + lines.length + ' biến trong ' + outFile);
  send('quit'); process.exit(0);
})();
