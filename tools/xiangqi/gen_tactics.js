// Sinh bài "Chiến thuật" (và một ít bài chiếu bí) từ ván tự đấu của Pikafish.
// Dùng:  node tools/xiangqi/gen_tactics.js <pikafish.exe> [--minutes 120] [--workers 2] [--threads 2] [--games 0] [--easy 0.4] [--out tactics.json]
//   --minutes  thời gian chạy tối đa (mặc định 120); --games: số ván tối đa (0 = không giới hạn, chạy hết thời gian)
//   --workers  số Pikafish chạy song song (mỗi cái --threads luồng); nên để workers × threads ≤ số nhân CPU
//   --easy     tỉ lệ giữ bài dễ nhất (hạng 700, engine tự viết thấy ngay ở độ sâu 1), mặc định 0.4 để bài không quá dễ
// Chạy lại được: bài cũ trong tệp ra được giữ nguyên (cả mã bài), bài mới nối tiếp; dừng giữa chừng không mất bài đã ghi.
// Ý tưởng (giống cách làm bài tập của các trang cờ): một bên chơi yếu (độ sâu thấp, đổi theo từng ván để sơ hở có độ khó khác
// nhau) nên hay sơ hở; bên mạnh tìm nước thắng thế. Chỉ giữ thế khi nước đúng duy nhất: nước tốt nhất ≥ +250 (hoặc chiếu hết),
// hơn nước thứ hai ≥ 200, nước thứ hai ≤ +120. Lọc nhanh 0,4 giây/nước, thế đạt thì kiểm lại 1,5 giây.
// Hạng bài ước lượng theo độ sâu engine tự viết (src/xiangqi/core/xq.js) cần để tìm ra nước đó.
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const XQ = require('../../src/xiangqi/core/xq.js');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
if (!argv[0] || argv[0].startsWith('--')) { console.error('Thiếu đường dẫn Pikafish.'); process.exit(1); }
const exe = path.resolve(argv[0]);
const MINUTES = +opt('minutes', 120), WORKERS = +opt('workers', 2), THREADS = +opt('threads', 2), MAX_GAMES = +opt('games', 0), EASY = +opt('easy', 0.4);
const outFile = opt('out', path.join(__dirname, '..', '..', 'data', 'xiangqi', 'tactics.json'));
const deadline = Date.now() + MINUTES * 60000;

// ---- Một Pikafish (giao tiếp UCI) ----
function Engine() {
  const eng = spawn(exe, [], { cwd: path.dirname(exe) });
  let buf = '', waiters = [];
  eng.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); waiters = waiters.filter(w => !w(l)); } });
  eng.on('exit', c => { if (!quitting) { console.error('Pikafish thoát bất ngờ (mã ' + c + ')'); process.exit(1); } });
  const send = s => eng.stdin.write(s + '\n');
  const until = (pred, col) => new Promise(r => waiters.push(l => { if (col) col(l); if (pred(l)) { r(); return true; } return false; }));
  return {
    async init() {
      send('uci'); await until(l => l === 'uciok');
      send('setoption name Threads value ' + THREADS); send('setoption name Hash value 128'); send('isready'); await until(l => l === 'readyok');
    },
    async go(movesStr, cmd, multipv) {
      send('setoption name MultiPV value ' + multipv);
      send('position startpos' + (movesStr ? ' moves ' + movesStr : ''));
      const best = {}; let bm = '';
      send(cmd);
      await until(l => l.startsWith('bestmove'), l => { const p = info(l); if (p && !p.bound) best[p.k] = p; if (l.startsWith('bestmove')) bm = l.split(/\s+/)[1]; });
      return { lines: Object.values(best).sort((a, b) => a.k - b.k), bm };
    },
    quit() { send('quit'); }
  };
}
let quitting = false;
const info = l => { const m = l.match(/depth (\d+).* multipv (\d+) score (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?.* pv (.+)$/); return m ? { d: +m[1], k: +m[2], kind: m[3], v: +m[4], bound: m[5], pv: m[6].trim().split(/\s+/) } : null; };
const val = p => p.kind === 'mate' ? (p.v > 0 ? 100000 - p.v : -100000 - p.v) : p.v;

// Hạng bài: độ sâu nhỏ nhất mà engine tự viết tìm ra đúng nước (càng sâu càng khó)
const S = new XQ.Searcher();
const RATE = [[1, 700], [2, 850], [3, 1000], [4, 1150], [5, 1300], [6, 1450], [7, 1600]];
function rate(fen, bestUci) {
  const pos = XQ.Pos.fromFen(fen);
  for (const [d, r] of RATE) {
    S.clear(); const m = S.search(pos, { maxDepth: d, timeMs: 4000 }).move;
    if (m && XQ.mvStr(m) === bestUci) return r;
  }
  return 1800;
}
function notate(fen, uci, n) {
  const pos = XQ.Pos.fromFen(fen), out = [];
  for (const u of uci.slice(0, n)) { const m = pos.legalMoves().find(x => XQ.mvStr(x) === u); if (m === undefined) break; out.push(pos.notation(m)); pos.make(m); }
  return out;
}

const res = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : [];
const seen = new Set(res.map(r => r.fen));
let nextId = res.reduce((mx, r) => Math.max(mx, +String(r.id).slice(1) || 0), 0) + 1;
let gamesStarted = 0, added = 0;
const save = () => { const tmp = outFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(res, null, 1)); fs.renameSync(tmp, outFile); };
const timeLeft = () => Date.now() < deadline;

async function playGame(E, g) {
  const weak = g % 2; // 0 = Đỏ yếu, 1 = Đen yếu
  const weakDepth = [2, 3, 4, 5][(g >> 1) % 4];   // bên yếu đi sâu khác nhau từng ván: sơ hở dễ thấy đến khó thấy
  const moves = []; let prevStrong = 0; const before = added;
  const unique = (A, B) => A && B && val(A) >= 250 && val(A) - val(B) >= 200 && val(B) <= 120;
  for (let ply = 0; ply < 110 && timeLeft(); ply++) {
    const side = ply % 2, isWeak = side === weak, ms = moves.join(' ');
    if (!isWeak && ply >= 10) {
      let a = await E.go(ms, 'go movetime 400', 2); let A = a.lines[0], B = a.lines[1];
      if (!A) break;
      if (unique(A, B)) { a = await E.go(ms, 'go movetime 1500', 2); A = a.lines[0]; B = a.lines[1]; }   // kiểm lại kỹ hơn
      if (unique(A, B)) {
        const pos = XQ.Pos.fromFen(XQ.START_FEN); let okp = true;
        for (const u of moves) { const m = pos.legalMoves().find(x => XQ.mvStr(x) === u); if (m === undefined) { okp = false; break; } pos.make(m); }
        const fen = pos.fen();
        const r = okp && !seen.has(fen) && !pos.inCheck(pos.side) ? rate(fen, A.pv[0]) : 0;
        if (r && (r > 700 || Math.random() < EASY)) {
          seen.add(fen);
          const type = A.kind === 'mate' ? 'mate' : 'tactic';
          const t = { id: 't' + (nextId++), fen, side: pos.side === 0 ? 'w' : 'b', type, mate: A.kind === 'mate' ? A.v : 0, cp: A.kind === 'cp' ? A.v : 0, gap: Math.min(val(A) - val(B), 9999), best: A.pv[0], pv: A.pv.slice(0, 8), sol: notate(fen, A.pv, 6), rating: r };
          res.push(t); added++; save();
          console.log(`ván ${g + 1}, nước ${ply + 1}: +${type} ${t.sol[0]} (hạng ${t.rating}) — mới ${added}, tổng ${res.length}`);
        }
      }
      prevStrong = val(A);
      moves.push(A.pv[0]);                         // bên mạnh chơi nước tốt nhất
    } else if (isWeak) {
      const a = await E.go(ms, 'go depth ' + weakDepth, 3);   // bên yếu: chọn ngẫu nhiên trong các nước kém nước tốt nhất ≤ 200
      if (!a.lines.length || a.bm === '(none)') break;
      const top = val(a.lines[0]); const pool = a.lines.filter(l => top - val(l) <= 200);
      moves.push(pool[(Math.random() * pool.length) | 0].pv[0]);
    } else {
      const a = await E.go(ms, 'go movetime 150', 1);
      if (!a.lines.length || a.bm === '(none)') break;
      moves.push(a.lines[0].pv[0]);
    }
    if (prevStrong > 1500) break;                  // ván đã phân thắng bại, sang ván khác
  }
  console.log(`-- hết ván ${g + 1}: ${moves.length} nước, +${added - before} bài`);
}

async function worker() {
  const E = Engine(); await E.init();
  while (timeLeft() && (!MAX_GAMES || gamesStarted < MAX_GAMES)) await playGame(E, gamesStarted++);
  E.quit();
}
(async () => {
  console.log(`Chạy ${WORKERS} Pikafish × ${THREADS} luồng, tối đa ${MINUTES} phút${MAX_GAMES ? ', ' + MAX_GAMES + ' ván' : ''}. Có sẵn ${res.length} bài.`);
  await Promise.all(Array.from({ length: WORKERS }, worker));
  quitting = true;
  const by = {}; res.forEach(r => { by[r.rating] = (by[r.rating] || 0) + 1; });
  console.log(`Xong: ${gamesStarted} ván, thêm ${added} bài, tổng ${res.length} bài trong ${outFile}. Theo hạng:`, by);
  process.exit(0);
})();
