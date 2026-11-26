// Sinh cây khai cuộc bằng Pikafish: duyệt theo tầng (BFS), mỗi thế lấy tối đa vài nước tốt gần nhau.
// Dùng:  node gen_opening_tree.js <pikafish.exe> [tổng-số-thế=1800] [opening_tree.json] [movetime-ms=450]
// Chạy lại được: đọc file kết quả cũ và làm tiếp. Mỗi thế lưu: fen, cp (góc nhìn bên đi), các nước ứng viên.
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const XQ = require('../../src/xiangqi/core/xq.js');
const exe = path.resolve(process.argv[2] || ''), cap = +(process.argv[3] || 1800), outFile = process.argv[4] || path.join(__dirname, '..', '..', 'data', 'xiangqi', 'opening_tree.json'), MT = +(process.argv[5] || 450);
if (!process.argv[2]) { console.error('Thiếu đường dẫn Pikafish.'); process.exit(1); }
const MAXPLY = 12;           // sâu tối đa (số nước, tính cả hai bên)
const MARGIN = 40;           // chỉ giữ nước kém nước tốt nhất không quá ngần này centipawn
const ROOT_MARGIN = 70, ROOT_MAX = 7, MAXKIDS = 3;
const STOP_CP = 350;         // thế đã nghiêng hẳn thì không đào tiếp

const eng = spawn(exe, [], { cwd: path.dirname(exe) });
let buf = '', waiters = [];
eng.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); waiters = waiters.filter(w => !w(l)); } });
const send = s => eng.stdin.write(s + '\n');
const until = (pred, col) => new Promise(r => waiters.push(l => { if (col) col(l); if (pred(l)) { r(); return true; } return false; }));
const info = l => { const m = l.match(/depth (\d+).* multipv (\d+) score (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?.* pv (.+)$/); return m ? { d: +m[1], k: +m[2], kind: m[3], v: +m[4], bound: m[5], pv: m[6].split(' ') } : null; };
const val = p => p.kind === 'mate' ? (p.v > 0 ? 100000 - p.v : -100000 - p.v) : p.v;
async function go(movesStr, multipv) {
  send('setoption name MultiPV value ' + multipv);
  send('position startpos' + (movesStr ? ' moves ' + movesStr : ''));
  const best = {};
  send('go movetime ' + MT);
  await until(l => l.startsWith('bestmove'), l => { const p = info(l); if (p && !p.bound) best[p.k] = p; });
  return Object.values(best).sort((a, b) => a.k - b.k);
}
const posKey = f => f.split(' ').slice(0, 2).join(' ');
const posOf = moves => { const p = XQ.Pos.fromFen(XQ.START_FEN); for (const u of moves) { const m = p.legalMoves().find(x => XQ.mvStr(x) === u); if (m === undefined) return null; p.make(m); } return p; };

(async () => {
  send('uci'); await until(l => l === 'uciok');
  send('setoption name Threads value 2'); send('setoption name Hash value 128'); send('isready'); await until(l => l === 'readyok');
  // nodes: khoá = chuỗi nước đầu tiên đến thế đó
  const nodes = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  const seenFen = new Set(Object.values(nodes).map(n => posKey(n.fen)));
  const queue = [''];
  let newCount = 0;
  const save = () => fs.writeFileSync(outFile, JSON.stringify(nodes));
  while (queue.length && Object.keys(nodes).length < cap) {
    const key = queue.shift(), moves = key ? key.split(' ') : [];
    let nd = nodes[key];
    if (!nd) {
      const p = posOf(moves); if (!p) continue;
      const fen = p.fen();
      if (key && seenFen.has(posKey(fen))) continue;   // trùng thế (đổi thứ tự nước)
      const mpv = moves.length === 0 ? ROOT_MAX : MAXKIDS + 1;
      const lines = await go(key, mpv);
      if (!lines.length) continue;
      nd = { fen, ply: moves.length, cp: val(lines[0]), c: lines.map(l => ({ m: l.pv[0], cp: val(l) })) };
      nodes[key] = nd; seenFen.add(posKey(fen)); newCount++;
      if (newCount % 20 === 0) { save(); console.log(`đã phân tích ${Object.keys(nodes).length} thế (hàng đợi ${queue.length})`); }
    } else seenFen.add(posKey(nd.fen));
    if (nd.ply >= MAXPLY || Math.abs(nd.cp) >= STOP_CP) continue;
    const margin = nd.ply === 0 ? ROOT_MARGIN : MARGIN, top = nd.c[0].cp;
    const kids = nd.c.filter(x => top - x.cp <= margin).slice(0, nd.ply === 0 ? ROOT_MAX : MAXKIDS);
    for (const k of kids) queue.push((key ? key + ' ' : '') + k.m);
  }
  save();
  console.log('Xong. ' + Object.keys(nodes).length + ' thế trong ' + outFile + (queue.length ? ' (còn ' + queue.length + ' thế chưa duyệt; chạy lại để làm tiếp)' : ''));
  send('quit'); process.exit(0);
})();
