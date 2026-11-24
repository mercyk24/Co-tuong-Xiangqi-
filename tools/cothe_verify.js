// Kiểm tra danh sách cờ thế bằng Pikafish.
// Dùng:  node cothe_verify.js <đường-dẫn-pikafish.exe> [cothe_candidates.json] [giây-mỗi-thế=20]
// Đầu ra: cothe_verified.json (thế đạt) và cothe_report.txt (lý do loại / ghi chú).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const XQ = require('../src/core/xq.js');

const exe = process.argv[2];
const inFile = process.argv[3] || path.join(__dirname, '..', 'data', 'cothe_candidates.json');
const secs = +(process.argv[4] || 20);
if (!exe) { console.error('Thiếu đường dẫn Pikafish.'); process.exit(1); }

const cands = JSON.parse(fs.readFileSync(inFile, 'utf8').replace(/^﻿/, ''));
const exeAbs = path.resolve(exe);
const eng = spawn(exeAbs, [], { cwd: path.dirname(exeAbs) });
let buf = '', waiters = [];
eng.stdout.on('data', d => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    waiters = waiters.filter(w => !w(line));
  }
});
const send = s => eng.stdin.write(s + '\n');
const until = (pred, collect) => new Promise(res => {
  waiters.push(line => { if (collect) collect(line); if (pred(line)) { res(); return true; } return false; });
});

function toNotation(fen, uciPv, maxPly) {
  const pos = XQ.Pos.fromFen(fen); const out = [];
  for (const u of uciPv.slice(0, maxPly)) {
    const m = pos.legalMoves().find(x => XQ.mvStr(x) === u);
    if (m === undefined) break;
    out.push(pos.notation(m)); pos.make(m);
  }
  return out;
}
// Chấp nhận ký hiệu WXF (H=Mã, E=Tượng) và đổi sang ký hiệu của app (N, B).
function normFen(f) {
  const [b, ...r] = f.trim().split(/\s+/);
  const board = b.replace(/h/g, 'n').replace(/H/g, 'N').replace(/e/g, 'b').replace(/E/g, 'B');
  const side = r[0] === 'b' ? 'b' : 'w';
  return [board, side, '-', '-', '0', '1'].join(' ');
}
function parseInfo(line) {
  const m = line.match(/multipv (\d+) score (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?.* pv (.+)$/);
  if (!m) return null;
  return { k: +m[1], kind: m[2], v: +m[3], bound: m[4] || '', pv: m[5].trim().split(/\s+/), depth: +(line.match(/depth (\d+)/) || [0, 0])[1] };
}

(async () => {
  send('uci'); await until(l => l === 'uciok');
  send('setoption name Threads value 2'); send('setoption name Hash value 128'); send('setoption name MultiPV value 2');
  send('isready'); await until(l => l === 'readyok');
  const ok = [], rep = [];
  for (const c of cands) {
    const tag = c.id + ' ' + (c.name || '');
    let pos;
    try { pos = XQ.Pos.fromFen(normFen(c.fen)); } catch (e) { rep.push(`LOẠI ${tag}: FEN sai (${e.message})`); continue; }
    if (pos.ks[0] < 0 || pos.ks[1] < 0) { rep.push(`LOẠI ${tag}: thiếu Tướng hoặc Soái`); continue; }
    const other = 1 - pos.side;
    if (pos.inCheck(other)) { rep.push(`LOẠI ${tag}: bên không đến lượt đang bị chiếu (thế không hợp lệ)`); continue; }
    const fen = pos.fen();
    send('ucinewgame'); send('position fen ' + (fen.split(/\s+/).length >= 6 ? fen : fen.split(/\s+/).slice(0, 2).join(' ') + ' - - 0 1')); send('isready'); await until(l => l === 'readyok');
    const best = {};
    send('go movetime ' + secs * 1000);
    await until(l => l.startsWith('bestmove'), l => { const p = parseInfo(l); if (p && !p.bound) best[p.k] = p; });
    const a = best[1], b = best[2];
    if (!a) { rep.push(`LOẠI ${tag}: engine không trả kết quả`); continue; }
    const val = p => p.kind === 'mate' ? (p.v > 0 ? 100000 - p.v : -100000 - p.v) : p.v;
    const sa = val(a), sb = b ? val(b) : -100000;
    const win = sa >= 300;
    const unique = win && (sa - sb >= 150);
    const sol = toNotation(fen, a.pv, 40);
    const desc = `${a.kind === 'mate' ? 'chiếu hết trong ' + a.v : 'cp ' + a.v}, độ sâu ${a.depth}; nước 2: ${b ? (b.kind === 'mate' ? 'mate ' + b.v : 'cp ' + b.v) : 'không có'}`;
    if (!win) { rep.push(`LOẠI ${tag}: bên đi trước không thắng rõ (${desc}). Có thể là thế hòa hoặc nhập sai quân.`); continue; }
    rep.push(`${unique ? 'ĐẠT ' : 'ĐẠT (nước đầu không duy nhất) '}${tag}: ${desc}`);
    ok.push(Object.assign({}, c, { fen, side: pos.side === 0 ? 'w' : 'b', verify: { score: a.kind + ' ' + a.v, depth: a.depth, unique }, solution: sol }));
    console.log(rep[rep.length - 1]);
  }
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'cothe_verified.json'), JSON.stringify(ok, null, 1));
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'cothe_report.txt'), rep.join('\n') + '\n');
  console.log(`\nXong: ${ok.length}/${cands.length} thế đạt. Xem cothe_report.txt`);
  send('quit'); process.exit(0);
})();
