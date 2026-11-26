// Tải nguyên liệu cho cờ vua (cần mạng; chạy một lần trên máy phát triển, kết quả được lưu vào kho mã):
//   1. Hình quân cờ "cburnett" của Lichess (Colin M.L. Burnett, GPLv2+)  -> src/chess/pieces/*.svg
//   2. Danh sách khai cuộc lichess-org/chess-openings (CC0)                 -> data/chess/src/openings/{a..e}.tsv
//   3. Kho bài tập Lichess (CC0, ~270 MB nén): chỉ giữ vài nghìn bài chọn lọc -> data/chess/src/puzzles-selected.csv
// Sau đó chạy: node tools/chess/build-data.js  (không cần mạng) để tạo data/chess/*.json.
//
// Cách chạy: node tools/chess/fetch-data.mjs [--skip-puzzles] [--only-puzzles]
// Giải nén .zst: ưu tiên gói fzstd nếu đã cài (npm i --no-save fzstd, không ghi vào package.json); không có thì dùng zlib của Node
// (Node ≥ 22.15), kèm bước bỏ các "skippable frame" mà tệp nén đa luồng (pzstd) của Lichess chèn trước mỗi khối.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const r = (...p) => path.join(ROOT, ...p);
const skipPuzzles = process.argv.includes('--skip-puzzles');
const onlyPuzzles = process.argv.includes('--only-puzzles');

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
  return res;
}

if (!onlyPuzzles) {
// 1. Quân cờ
const PIECES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];
fs.mkdirSync(r('src/chess/pieces'), { recursive: true });
for (const p of PIECES) {
  const t = await (await get('https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/' + p + '.svg')).text();
  if (!/<svg[\s\S]*<\/svg>/.test(t)) throw new Error('Hình quân ' + p + ' không hợp lệ');
  fs.writeFileSync(r('src/chess/pieces', p + '.svg'), t);
}
console.log('Đã tải 12 hình quân cburnett.');

// 2. Khai cuộc
fs.mkdirSync(r('data/chess/src/openings'), { recursive: true });
let nOpen = 0;
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const t = await (await get('https://raw.githubusercontent.com/lichess-org/chess-openings/master/' + f + '.tsv')).text();
  if (!/^eco\tname\tpgn/.test(t)) throw new Error(f + '.tsv sai dạng');
  fs.writeFileSync(r('data/chess/src/openings', f + '.tsv'), t);
  nOpen += t.trim().split('\n').length - 1;
}
console.log('Đã tải ' + nOpen + ' khai cuộc.');
}

if (skipPuzzles) process.exit(0);

// 3. Bài tập: lọc trực tiếp khi đang giải nén, không lưu tệp lớn
// Cột: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
// Giải nén tệp nén đa luồng (pzstd) bằng zlib của Node: pzstd ghi trước mỗi khối nén một skippable frame (magic 0x184D2A50..5F)
// dài 4 byte chứa độ dài khối đó. Luồng giải nén zstd của Node chỉ đọc khối ĐẦU TIÊN rồi lặng lẽ dừng, nên ở đây tách từng khối
// theo độ dài báo trước rồi giải nén riêng từng khối. Khối không có độ dài báo trước thì báo lỗi (khi đó cần fzstd).
function pzstdDecode() {
  let buf = Buffer.alloc(0), need = 0;
  return new Transform({
    transform(chunk, enc, cb) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      const out = [];
      try {
        for (;;) {
          if (need > 0) {
            if (buf.length < need) break;
            out.push(zlib.zstdDecompressSync(buf.subarray(0, need), { maxOutputLength: 1 << 30 }));
            buf = buf.subarray(need); need = 0; continue;
          }
          if (buf.length < 8) break;
          if (((buf.readUInt32LE(0) & 0xFFFFFFF0) >>> 0) !== 0x184D2A50) throw new Error('khối nén không có độ dài báo trước (không phải dạng pzstd)');
          const len = buf.readUInt32LE(4);
          if (buf.length < 8 + len) break;
          if (len === 4) need = buf.readUInt32LE(8);
          buf = buf.subarray(8 + len);
        }
      } catch (e) { cb(e); return; }
      cb(null, out.length ? Buffer.concat(out) : undefined);
    },
    flush(cb) { cb(buf.length || need ? new Error('tệp nén bị cụt') : null); }
  });
}
async function zstdStream(body) {
  const src = Readable.fromWeb(body);
  let fz = null;
  try { fz = await import('fzstd'); } catch (e) { /* chưa cài fzstd: dùng zlib */ }
  if (fz) {
    console.log('Giải nén bằng fzstd.');
    const out = new Readable({ read() {} });
    const d = new fz.Decompress((chunk, final) => { out.push(Buffer.from(chunk)); if (final) out.push(null); });
    (async () => { for await (const c of src) d.push(new Uint8Array(c)); d.push(new Uint8Array(0), true); })().catch(e => out.destroy(e));
    return out;
  }
  if (typeof zlib.zstdDecompressSync !== 'function') throw new Error('Node chưa có giải nén zstd. Chạy: npm i --no-save fzstd  rồi chạy lại.');
  console.log('Giải nén bằng zlib của Node (từng khối pzstd).');
  const dec = pzstdDecode();
  src.on('error', e => dec.destroy(e));   // lỗi tải cũng làm dừng và báo lỗi, không bị nuốt
  return src.pipe(dec);
}
// Chọn đều theo độ khó: mỗi "giỏ" (nhóm loại bài + khoảng điểm 200) giữ tối đa QUOTA bài, ưu tiên bài được chơi nhiều
const MATE = { mateIn1: 30, mateIn2: 40, mateIn3: 30, mateIn4: 16, mateIn5: 8 };   // mỗi giỏ điểm
const TAC_PER_BUCKET = 130;
const MOTIFS = ['fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'sacrifice', 'deflection', 'attraction', 'hangingPiece',
  'trappedPiece', 'capturingDefender', 'intermezzo', 'quietMove', 'xRayAttack', 'clearance', 'interference', 'promotion', 'advancedPawn',
  'zugzwang', 'exposedKing', 'kingsideAttack', 'defensiveMove', 'backRankMate', 'smotheredMate', 'mate'];
const buckets = new Map();
let rows = 0;
const res = await get('https://database.lichess.org/lichess_db_puzzle.csv.zst');
const rl = readline.createInterface({ input: await zstdStream(res.body), crlfDelay: Infinity });
let header = null;
for await (const line of rl) {
  if (!header) { header = line.split(','); continue; }
  rows++;
  if (rows % 500000 === 0) console.log('…đã đọc ' + rows + ' bài');
  const c = line.split(',');
  const [id, fen, moves, rating, rd, pop, plays, themes] = c;
  if (+pop < 85 || +plays < 800 || +rd > 90) continue;
  const th = themes.split(' ');
  const n = moves.split(' ').length;
  let kind = null;
  const mk = Object.keys(MATE).find(k => th.includes(k));
  if (mk) kind = mk;
  else if (n >= 2 && n <= 8 && th.some(t => MOTIFS.includes(t))) kind = 'tac';
  if (!kind) continue;
  const b = kind + ':' + Math.min(13, Math.floor(+rating / 200));
  const q = kind === 'tac' ? TAC_PER_BUCKET : MATE[kind];
  let arr = buckets.get(b); if (!arr) buckets.set(b, arr = []);
  arr.push({ plays: +plays, line: [id, fen, moves, rating, rd, pop, plays, themes].join(',') });
  if (arr.length > q * 3) { arr.sort((x, y) => y.plays - x.plays); arr.length = q; }
}
if (!header || rows < 100000) throw new Error('Giải nén kho bài tập thất bại: chỉ đọc được ' + rows + ' dòng. Thử: npm i --no-save fzstd  rồi chạy lại với --only-puzzles.');
const out = [header.slice(0, 8).join(',')];
for (const [b, arr] of [...buckets.entries()].sort()) {
  const kind = b.split(':')[0], q = kind === 'tac' ? TAC_PER_BUCKET : MATE[kind];
  arr.sort((x, y) => y.plays - x.plays);
  for (const x of arr.slice(0, q)) out.push(x.line);
}
fs.mkdirSync(r('data/chess/src'), { recursive: true });
fs.writeFileSync(r('data/chess/src/puzzles-selected.csv'), out.join('\n') + '\n');
console.log('Đã đọc ' + rows + ' bài, giữ ' + (out.length - 1) + ' bài vào data/chess/src/puzzles-selected.csv');
