// Sinh bài "Chiến thuật" và "Chiếu bí" từ ván tự đấu của Pikafish.
// Dùng:  node gen_tactics.js <pikafish.exe> [số-ván=30] [tactics.json]
// Ý tưởng (giống cách làm bài tập của các trang cờ): một bên chơi yếu (độ sâu thấp) nên hay sơ hở;
// bên mạnh tìm nước thắng thế. Chỉ giữ thế khi nước đúng duy nhất, hơn hẳn nước thứ hai, và lợi thế vừa mới xuất hiện.
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const XQ = require('../../src/xiangqi/core/xq.js');
const exe = path.resolve(process.argv[2] || ''), games = +(process.argv[3] || 30), outFile = process.argv[4] || path.join(__dirname, '..', '..', 'data', 'xiangqi', 'tactics.json');
if (!process.argv[2]) { console.error('Thiếu đường dẫn Pikafish.'); process.exit(1); }

const eng = spawn(exe, [], { cwd: path.dirname(exe) });
let buf = '', waiters = [];
eng.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); waiters = waiters.filter(w => !w(l)); } });
const send = s => eng.stdin.write(s + '\n');
const until = (pred, col) => new Promise(r => waiters.push(l => { if (col) col(l); if (pred(l)) { r(); return true; } return false; }));
const info = l => { const m = l.match(/depth (\d+).* multipv (\d+) score (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?.* pv (.+)$/); return m ? { d: +m[1], k: +m[2], kind: m[3], v: +m[4], bound: m[5], pv: m[6].trim().split(/\s+/) } : null; };
const val = p => p.kind === 'mate' ? (p.v > 0 ? 100000 - p.v : -100000 - p.v) : p.v;
async function go(movesStr, cmd, multipv) {
  send('setoption name MultiPV value ' + multipv);
  send('position startpos' + (movesStr ? ' moves ' + movesStr : ''));
  const best = {}; let bm = '';
  send(cmd);
  await until(l => l.startsWith('bestmove'), l => { const p = info(l); if (p && !p.bound) best[p.k] = p; if (l.startsWith('bestmove')) bm = l.split(/\s+/)[1]; });
  return { lines: Object.values(best).sort((a, b) => a.k - b.k), bm };
}
const S = new XQ.Searcher();
function rate(fen, bestUci) {
  const pos = XQ.Pos.fromFen(fen);
  for (const [d, r] of [[1, 700], [2, 850], [3, 1000], [4, 1150], [5, 1300]]) {
    S.clear(); const m = S.search(pos, { maxDepth: d, timeMs: 3000 }).move;
    if (m && XQ.mvStr(m) === bestUci) return r;
  }
  return 1450;
}
function notate(fen, uci, n) {
  const pos = XQ.Pos.fromFen(fen), out = [];
  for (const u of uci.slice(0, n)) { const m = pos.legalMoves().find(x => XQ.mvStr(x) === u); if (m === undefined) break; out.push(pos.notation(m)); pos.make(m); }
  return out;
}
(async () => {
  send('uci'); await until(l => l === 'uciok');
  send('setoption name Threads value 2'); send('setoption name Hash value 128'); send('isready'); await until(l => l === 'readyok');
  const res = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : [];
  const seen = new Set(res.map(r => r.fen));
  for (let g = 0; g < games; g++) {
    const weak = g % 2; // 0 = Đỏ yếu, 1 = Đen yếu
    const moves = []; let prevStrong = null; const before = res.length;
    for (let ply = 0; ply < 110; ply++) {
      const side = ply % 2, isWeak = side === weak, ms = moves.join(' ');
      if (!isWeak && ply >= 10) {
        const a = await go(ms, 'go movetime 1000', 2); const A = a.lines[0], B = a.lines[1];
        if (!A) break;
        // "Nước duy nhất": nước tốt nhất thắng rõ, còn nước thứ hai không thắng (không bắt buộc lợi thế phải vừa mới xuất hiện).
        if (B && val(A) >= 250 && val(A) - val(B) >= 200 && val(B) <= 120) {
          const pos = XQ.Pos.fromFen(XQ.START_FEN); let okp = true;
          for (const u of moves) { const m = pos.legalMoves().find(x => XQ.mvStr(x) === u); if (m === undefined) { okp = false; break; } pos.make(m); }
          const fen = pos.fen();
          if (okp && !seen.has(fen) && !pos.inCheck(pos.side)) {
            seen.add(fen);
            const type = A.kind === 'mate' ? 'mate' : 'tactic';
            res.push({ id: 't' + (res.length + 1), fen, side: pos.side === 0 ? 'w' : 'b', type, mate: A.kind === 'mate' ? A.v : 0, cp: A.kind === 'cp' ? A.v : 0, gap: Math.min(val(A) - val(B), 9999), best: A.pv[0], pv: A.pv.slice(0, 8), sol: notate(fen, A.pv, 6), rating: rate(fen, A.pv[0]) });
            fs.writeFileSync(outFile, JSON.stringify(res, null, 1));
            console.log(`ván ${g + 1}, nước ${ply + 1}: +${type} ${res[res.length - 1].sol[0]} (hạng ${res[res.length - 1].rating}) — tổng ${res.length}`);
          }
        }
        prevStrong = val(A);
        // bên mạnh chơi nước tốt nhất
        moves.push(A.pv[0]);
      } else if (isWeak) {
        const a = await go(ms, 'go depth 2', 3);
        if (!a.lines.length || a.bm === '(none)') break;
        const top = val(a.lines[0]); const pool = a.lines.filter(l => top - val(l) <= 200);
        moves.push(pool[(Math.random() * pool.length) | 0].pv[0]);
      } else {
        const a = await go(ms, 'go movetime 150', 1);
        if (!a.lines.length || a.bm === '(none)') break;
        moves.push(a.lines[0].pv[0]);
      }
      if ((prevStrong || 0) > 1500) break; // ván đã phân thắng bại, sang ván khác

    }
    console.log(`-- hết ván ${g + 1}: ${moves.length} nước, +${res.length - before} bài`);
  }
  console.log('Xong. Tổng ' + res.length + ' bài trong ' + outFile);
  send('quit'); process.exit(0);
})();
