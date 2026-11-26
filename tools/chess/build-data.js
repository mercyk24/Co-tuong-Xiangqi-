#!/usr/bin/env node
// Tạo dữ liệu cờ vua cho app từ nguyên liệu đã tải (tools/chess/fetch-data.mjs), không cần mạng:
//   data/chess/src/puzzles-selected.csv  ->  data/chess/puzzles.json (chiếu hết 1–5 nước), data/chess/tactics.json (chiến thuật)
//   data/chess/src/openings/*.tsv         ->  data/chess/openings.json (nhóm khai cuộc, biến, tên), data/chess/book.json (sách của máy)
// Mọi nước đi đều được kiểm tra lại bằng lõi luật của app (src/chess/core/chess.js); bài nào sai thì bỏ.
'use strict';
const fs = require('fs');
const path = require('path');
const CH = require('../../src/chess/core/chess.js');

const ROOT = path.resolve(__dirname, '..', '..');
const r = (...p) => path.join(ROOT, ...p);
const OUT = r('data', 'chess');

// ---------- Bài tập ----------
// Lichess: FEN là thế TRƯỚC nước của đối phương; Moves: nước đầu là của đối phương, sau đó mới là lời giải.
const KEEP_THEMES = ['fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'sacrifice', 'deflection', 'attraction', 'hangingPiece',
  'trappedPiece', 'capturingDefender', 'intermezzo', 'quietMove', 'xRayAttack', 'clearance', 'interference', 'promotion', 'advancedPawn',
  'zugzwang', 'exposedKing', 'kingsideAttack', 'defensiveMove', 'backRankMate', 'smotheredMate', 'mate', 'endgame', 'middlegame', 'opening'];
function readPuzzles() {
  const f = r('data/chess/src/puzzles-selected.csv');
  if (!fs.existsSync(f)) { console.warn('Chưa có ' + f + ' (chạy tools/chess/fetch-data.mjs trước). Bỏ qua bài tập.'); return null; }
  const lines = fs.readFileSync(f, 'utf8').trim().split(/\r?\n/);
  const head = lines.shift().split(',');
  const col = n => head.indexOf(n);
  const mates = [], tacs = [];
  let bad = 0;
  for (const line of lines) {
    const c = line.split(',');
    const lid = c[col('PuzzleId')], fen0 = c[col('FEN')], mv = c[col('Moves')].split(' '), rating = +c[col('Rating')], th = c[col('Themes')].split(' ');
    let pos;
    try { pos = CH.Pos.fromFen(fen0); } catch (e) { bad++; continue; }
    const pre = pos.parse(mv[0]); if (!pre) { bad++; continue; }
    pos.make(pre);
    const fen = pos.fen(), side = pos.side;
    // kiểm tra từng nước của lời giải
    const sol = mv.slice(1); let ok = sol.length > 0;
    const q = CH.Pos.fromFen(fen);
    for (const u of sol) { const m = q.parse(u); if (!m) { ok = false; break; } q.make(m); }
    if (!ok) { bad++; continue; }
    const mk = th.find(t => /^mateIn[1-5]$/.test(t));
    if (mk) {
      const n = +mk.slice(6), st = q.status();
      if (!st || st.result !== 'mate' || Math.ceil(sol.length / 2) !== n) { bad++; continue; }
      mates.push({ lid, n, side, fen, pre: mv[0], sol, r: rating });
    } else {
      tacs.push({ lid, fen, side: side ? 'b' : 'w', pre: mv[0], sol, r: rating, th: th.filter(t => KEEP_THEMES.includes(t)) });
    }
  }
  mates.sort((a, b) => a.n - b.n || a.r - b.r || (a.lid < b.lid ? -1 : 1));
  mates.forEach((p, i) => { p.id = i + 1; });
  tacs.sort((a, b) => a.r - b.r || (a.lid < b.lid ? -1 : 1));
  tacs.forEach((p, i) => { p.id = 't' + (i + 1); });
  const order = o => { const { id, ...rest } = o; return { id, ...rest }; };
  console.log('Bài tập: ' + mates.length + ' bài chiếu hết, ' + tacs.length + ' bài chiến thuật' + (bad ? ', bỏ ' + bad + ' bài sai' : '') + '.');
  return { mates: mates.map(order), tacs: tacs.map(order) };
}

// ---------- Khai cuộc ----------
// Các nhóm khai cuộc phổ biến: tên tiếng Việt, bên người học, giới thiệu ý tưởng (dự án tự viết), tên gốc trong danh sách Lichess.
const LINES = {
  "italian": [
  "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7",
  "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Bd2 Bxd2+ Nbxd2 d5",
  "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O",
  "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3",
  "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6 Nf3 e4 Ne5",
  "e4 e5 Nf3 Nc6 Bc4 Nf6 d4 exd4 O-O Nxe4 Re1 d5 Bxd5 Qxd5 Nc3",
  "e4 e5 Nf3 Nc6 Bc4 Be7 d4 exd4 Nxd4 Nf6 Nc3",
  "e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6 d3 d6 c3 O-O a4 a6"
 ],
  "ruy": [
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3",
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5 exd5 Nxd5 Nxe5 Nxe5 Rxe5 c6",
  "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8",
  "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4 exd4 Nxd4 c5",
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4 d4 b5 Bb3 d5 dxe5 Be6",
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6 c3 Bd7 d4",
  "e4 e5 Nf3 Nc6 Bb5 Bc5 c3 Nf6 O-O O-O d4 Bb6",
  "e4 e5 Nf3 Nc6 Bb5 Nd4 Nxd4 exd4 O-O c6 Bc4 Nf6 Re1"
 ],
  "qgambit": [
  "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6",
  "d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 e3 Be7 Bd3",
  "d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6",
  "d4 d5 c4 e6 Nf3 Nf6 Nc3 Be7 Bf4 O-O e3 c5",
  "d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 e3 c6 Nf3 Qa5",
  "d4 d5 c4 e6 Nc3 c5 cxd5 exd5 Nf3 Nc6 g3 Nf6 Bg2 Be7 O-O O-O",
  "d4 d5 c4 Nc6 Nf3 Bg4 cxd5 Bxf3 gxf3 Qxd5 e3",
  "d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 g3 Be6 Nbd2"
 ],
  "london": [
  "d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O Bd3",
  "d4 Nf6 Bf4 g6 Nf3 Bg7 e3 O-O Be2 d6 h3",
  "d4 d5 Bf4 c5 e3 Nc6 c3 Qb6 Qb3 c4 Qc2",
  "d4 Nf6 Nf3 e6 Bf4 b6 e3 Bb7 h3 Be7 Bd3 c5 c3",
  "d4 d5 Nf3 Nf6 Bf4 Bf5 e3 e6 Bd3 Bxd3 Qxd3",
  "d4 Nf6 Bf4 d5 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O Bd3"
 ],
  "english": [
  "c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6 Nf3 Nc6 O-O Be7",
  "c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 Nf6 O-O O-O d4",
  "c4 Nf6 Nc3 e6 e4 d5 e5 d4 exf6 dxc3 bxc3 Qxf6 d4",
  "c4 e6 Nf3 d5 g3 Nf6 Bg2 Be7 O-O O-O b3 c5",
  "c4 Nf6 Nc3 g6 g3 Bg7 Bg2 O-O e4 d6 Nge2",
  "c4 e5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 e4",
  "c4 c6 Nf3 d5 e3 Nf6 Nc3 e6 b3 Nbd7 Bb2"
 ],
  "kgambit": [
  "e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5 Nf6 Bc4 d5 exd5 Bd6",
  "e4 e5 f4 exf4 Nf3 d6 d4 g5 h4 g4 Ng1",
  "e4 e5 f4 exf4 Nf3 Nf6 e5 Nh5 d4 d6 Qe2",
  "e4 e5 f4 exf4 Bc4 Nf6 Nc3 c6 Bb3 d5 exd5 cxd5 d4",
  "e4 e5 f4 Bc5 Nf3 d6 c3 Nf6 d4 exd4 cxd4 Bb4+",
  "e4 e5 f4 d5 exd5 e4 d3 Nf6 dxe4 Nxe4 Nf3 Bc5 Qe2",
  "e4 e5 f4 exf4 Nf3 d5 exd5 Nf6 Bb5+ c6 dxc6 bxc6 Bc4"
 ],
  "sicilian": [
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3",
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6",
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5",
  "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be2 a6 O-O Nf6",
  "e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6",
  "e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 Be3 e6",
  "e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7 c4 Nc6 Nc3 g6",
  "e4 c5 Nf3 Nc6 Bb5 g6 O-O Bg7 Re1 e5",
  "e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6 Bd3 Nf6 O-O Qc7"
 ],
  "french": [
  "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4",
  "e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 O-O",
  "e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O Nf3 c5",
  "e4 e6 d4 d5 Nd2 c5 exd5 Qxd5 Ngf3 cxd4 Bc4 Qd6 O-O Nf6",
  "e4 e6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Nf3 Ngf6 Nxf6+ Nxf6",
  "e4 e6 d4 d5 exd5 exd5 Bd3 Nc6 c3 Bd6 Nf3 Nge7",
  "e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7 f4 c5 Nf3 Nc6 Be3"
 ],
  "carokann": [
  "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3",
  "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3",
  "e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4",
  "e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Be7",
  "e4 c6 d4 d5 Nd2 dxe4 Nxe4 Nd7 Nf3 Ngf6 Nxf6+ Nxf6",
  "e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3 Qxf3 e6",
  "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Nxf6+ exf6 c3 Bd6"
 ],
  "scandi": [
  "e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6",
  "e4 d5 exd5 Qxd5 Nc3 Qd6 d4 Nf6 Nf3 a6 g3",
  "e4 d5 exd5 Nf6 d4 Nxd5 Nf3 g6 c4 Nb6",
  "e4 d5 exd5 Qxd5 Nc3 Qd8 d4 Nf6 Nf3 Bg4 h3 Bxf3 Qxf3 c6",
  "e4 d5 exd5 Qxd5 Nf3 Bg4 Be2 Nc6 d4 O-O-O c3 e5"
 ],
  "kid": [
  "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7",
  "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 e5 d5 Nh5",
  "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f4 O-O Nf3 c5 d5 e6",
  "d4 Nf6 c4 g6 Nf3 Bg7 g3 O-O Bg2 d6 O-O Nbd7 Nc3 e5 e4",
  "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Be2 O-O Bg5 c5 d5 h6",
  "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 h3 O-O Bg5 c5 d5 e6",
  "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 d5 a5"
 ],
  "slav": [
  "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O",
  "d4 d5 c4 c6 Nf3 Nf6 e3 Bf5 Nc3 e6 Nh4 Bg6",
  "d4 d5 c4 c6 cxd5 cxd5 Nc3 Nf6 Bf4 Nc6 e3 Bf5",
  "d4 d5 c4 c6 Nf3 Nf6 Nc3 a6 e3 b5 b3 Bg4",
  "d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5 Bd3",
  "d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 Bg5 h6 Bh4 dxc4 e4 g5 Bg3 b5"
 ],
  "nimzo": [
  "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3",
  "d4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5 Bb7",
  "d4 Nf6 c4 e6 Nc3 Bb4 a3 Bxc3+ bxc3 c5 f3 d5 cxd5 Nxd5",
  "d4 Nf6 c4 e6 Nc3 Bb4 Nf3 c5 g3 cxd4 Nxd4 O-O Bg2 d5 cxd5 Nxd5",
  "d4 Nf6 c4 e6 Nc3 Bb4 Bg5 h6 Bh4 c5 d5 d6 e3",
  "d4 Nf6 c4 e6 Nc3 Bb4 f3 d5 a3 Bxc3+ bxc3 c5 cxd5 Nxd5",
  "d4 Nf6 c4 e6 Nc3 Bb4 Qb3 c5 dxc5 Nc6 Nf3 Ne4 Bd2 Nxd2"
 ]
};
const GROUPS = [
  { key: 'italian', en: 'Italian Game', title: 'Ván cờ Ý', side: 0, about: [
    'Sau 1.e4 e5 2.Nf3 Nc6 3.Bc4, Tượng Trắng nhắm thẳng vào ô f7, ô yếu nhất của Đen lúc đầu ván (chỉ có Vua bảo vệ).',
    'Ý tưởng: ra quân nhanh, nhập thành sớm, rồi đẩy c3 và d4 để chiếm trung tâm. Đây là khai cuộc tốt để học các nguyên tắc cơ bản.'] },
  { key: 'ruy', en: 'Ruy Lopez', title: 'Ván cờ Tây Ban Nha', side: 0, about: [
    'Sau 1.e4 e5 2.Nf3 Nc6 3.Bb5, Tượng Trắng gây sức ép lên Mã c6, quân đang bảo vệ Tốt e5.',
    'Một trong những khai cuộc lâu đời và được nghiên cứu kỹ nhất. Trắng chơi chậm mà chắc, tích lũy ưu thế nhỏ ở trung tâm.'] },
  { key: 'qgambit', en: "Queen's Gambit", title: 'Gambit Hậu', side: 0, about: [
    'Sau 1.d4 d5 2.c4, Trắng mời Đen ăn Tốt c4 để đổi lấy trung tâm. Gọi là "gambit" nhưng Trắng thường lấy lại được Tốt.',
    'Đen có thể nhận (dxc4) hoặc từ chối (e6, c6). Khai cuộc cổ điển, thế cờ rõ ràng, hợp để học kế hoạch trung cuộc.'] },
  { key: 'london', en: 'London System', title: 'Hệ thống London', side: 0, about: [
    'Trắng đi d4, Bf4, e3, Nf3, c3, Bd3 gần như bất kể Đen đi gì: một "hệ thống" dễ nhớ.',
    'Thế cờ vững chắc, ít bẫy. Hợp với người mới muốn có một cách chơi Trắng ổn định mà không phải học nhiều lý thuyết.'] },
  { key: 'english', en: 'English Opening', title: 'Khai cuộc Anh', side: 0, about: [
    'Trắng mở bằng 1.c4, kiểm soát ô d5 từ cánh, thường kết hợp Nc3, g3 và Bg2.',
    'Cờ linh hoạt, nhiều thế cờ "Sicilia ngược" (như phòng thủ Sicilia nhưng Trắng hơn một nước).'] },
  { key: 'kgambit', en: "King's Gambit", title: 'Gambit Vua', side: 0, about: [
    'Sau 1.e4 e5 2.f4, Trắng thí Tốt f để mở cột f và giành trung tâm, tấn công sớm vào Vua Đen.',
    'Khai cuộc lãng mạn, sắc bén, nhiều bẫy cho cả hai bên. Rất hợp để luyện tính toán chiến thuật.'] },
  { key: 'sicilian', en: 'Sicilian Defense', title: 'Phòng thủ Sicilia', side: 1, about: [
    'Đen đáp 1.e4 bằng 1...c5: không đối xứng, Đen tranh ô d4 từ cánh và thường đổi Tốt c lấy Tốt d của Trắng.',
    'Cách đáp phổ biến nhất với 1.e4 ở trình độ cao. Thế cờ sắc bén: Trắng thường tấn công cánh Vua, Đen phản công cánh Hậu.'] },
  { key: 'french', en: 'French Defense', title: 'Phòng thủ Pháp', side: 1, about: [
    'Đen đi 1...e6 rồi 2...d5, thách thức Tốt e4 ngay. Chuỗi Tốt của Đen vững nhưng Tượng c8 thường bị kẹt sau Tốt e6.',
    'Kế hoạch điển hình của Đen: phá chuỗi Tốt của Trắng bằng ...c5 và ...f6.'] },
  { key: 'carokann', en: 'Caro-Kann Defense', title: 'Phòng thủ Caro-Kann', side: 1, about: [
    'Đen đi 1...c6 rồi 2...d5. Giống phòng thủ Pháp nhưng Tượng c8 vẫn ra ngoài được trước khi đẩy e6.',
    'Rất vững chắc, ít điểm yếu; hợp với người thích thế cờ an toàn và tàn cuộc tốt.'] },
  { key: 'scandi', en: 'Scandinavian Defense', title: 'Phòng thủ Scandinavia', side: 1, about: [
    'Đen đáp 1.e4 bằng 1...d5 ngay, đổi Tốt trung tâm. Hậu Đen thường ăn lại ở d5 rồi lui về a5 hoặc d6.',
    'Dễ học, ít lý thuyết; Đen chấp nhận mất vài nhịp vì Hậu ra sớm để có thế cờ rõ ràng.'] },
  { key: 'kid', en: "King's Indian Defense", title: 'Phòng thủ Ấn Độ cổ (King\'s Indian)', side: 1, about: [
    'Đen đi Nf6, g6, Bg7, d6 và nhập thành, để Trắng dựng trung tâm Tốt lớn rồi phản công bằng ...e5 hoặc ...c5.',
    'Khai cuộc chiến đấu: thường hai bên tấn công ở hai cánh khác nhau, Đen hướng tới tấn công Vua bằng ...f5.'] },
  { key: 'slav', en: 'Slav Defense', title: 'Phòng thủ Slav', side: 1, about: [
    'Đen đáp Gambit Hậu bằng 2...c6, giữ chắc Tốt d5 mà không chặn Tượng c8.',
    'Vững như Caro-Kann nhưng dành cho 1.d4. Đen thường ăn Tốt c4 vào lúc thích hợp rồi giữ hoặc đổi lại.'] },
  { key: 'nimzo', en: 'Nimzo-Indian Defense', title: 'Phòng thủ Nimzo-Ấn', side: 1, about: [
    'Sau 1.d4 Nf6 2.c4 e6 3.Nc3 Bb4, Tượng Đen ghim Mã c3 để ngăn Trắng đẩy e4.',
    'Một trong những cách đáp 1.d4 tốt nhất; Đen sẵn sàng đổi Tượng lấy Mã để làm hỏng cấu trúc Tốt của Trắng.'] }
];
function readOpenings() {
  const dir = r('data/chess/src/openings');
  if (!fs.existsSync(dir)) { console.warn('Chưa có ' + dir + ' (chạy tools/chess/fetch-data.mjs trước). Bỏ qua khai cuộc.'); return null; }
  const all = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.tsv')).sort()) {
    const rows = fs.readFileSync(path.join(dir, f), 'utf8').trim().split(/\r?\n/).slice(1);
    for (const row of rows) {
      const [eco, name, pgn] = row.split('\t');
      const san = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/).filter(Boolean);
      // kiểm tra và đổi sang UCI
      const p = CH.Pos.fromFen(CH.START_FEN), uci = [], sanOk = [];
      let ok = true;
      for (const s of san) { const m = p.parseSan(s); if (!m) { ok = false; break; } uci.push(CH.mvStr(m)); sanOk.push(p.san(m)); p.make(m); }
      if (ok) all.push({ eco, name, san: sanOk, uci });
    }
  }
  // Nhóm và biến: các biến chính do dự án chọn (LINES), kiểm tra lại bằng lõi luật; tên lấy theo danh mục Lichess
  // (tên của đoạn đầu dài nhất có trong danh mục).
  const byKey = new Map(); for (const o of all) if (!byKey.has(o.san.join(' '))) byKey.set(o.san.join(' '), o);
  const groups = {}, lines = [], names = {};
  GROUPS.forEach((g, i) => {
    groups[g.key] = { title: g.title, en: g.en, side: g.side, order: i, about: g.about };
    LINES[g.key].forEach((str, j) => {
      const p = CH.Pos.fromFen(CH.START_FEN), moves = [];
      for (const t of str.split(' ')) {
        const m = p.parseSan(t);
        if (!m) throw new Error('Biến ' + g.key + '-' + (j + 1) + ': nước ' + t + ' không hợp lệ');
        moves.push(p.san(m)); p.make(m);
      }
      if (moves.join(' ') !== str) throw new Error('Biến ' + g.key + '-' + (j + 1) + ': ghi nước chưa chuẩn SAN (' + moves.join(' ') + ')');
      let name = '', eco = '';
      for (let k = 1; k <= moves.length; k++) {
        const o = byKey.get(moves.slice(0, k).join(' '));
        if (o) { name = o.name; eco = o.eco; names[moves.slice(0, k).join(' ')] = o.name; }
      }
      if (!name) throw new Error('Biến ' + g.key + '-' + (j + 1) + ' không có tên trong danh mục Lichess');
      names[str] = name;
      lines.push({ id: g.key + '-' + (j + 1), group: g.key, eco, name, moves });
    });
  });
  // Sách của máy (tối đa 16 nửa nước): các biến chính ở trên (trọng số 3) cùng các khai cuộc đứng đắn trong danh mục Lichess
  // (trọng số 1, bỏ các gambit hiếm). Mỗi thế: danh sách nước tiếp theo, nước lặp lại theo trọng số (tối đa 6 lần).
  const MAIN = ["Italian Game", "Ruy Lopez", "Scotch Game", "Four Knights Game", "Petrov's Defense", "Queen's Gambit Declined",
    "Queen's Gambit Accepted", "Slav Defense", "Semi-Slav Defense", "Sicilian Defense", "French Defense", "Caro-Kann Defense",
    "King's Indian Defense", "Nimzo-Indian Defense", "Queen's Indian Defense", "Grünfeld Defense", "Catalan Opening",
    "English Opening", "Scandinavian Defense", "Pirc Defense", "Indian Defense", "Queen's Pawn Game", "Zukertort Opening", "Réti Opening",
    // thêm cho máy đổi khai cuộc nhiều hơn
    "Alekhine Defense", "Dutch Defense", "Benoni Defense", "Philidor Defense", "Vienna Game", "Bishop's Opening", "Modern Defense",
    "Tarrasch Defense", "Bogo-Indian Defense", "King's Indian Attack", "Trompowsky Attack", "Torre Attack", "Three Knights Opening",
    "Ponziani Opening", "Old Indian Defense", "Neo-Grünfeld Defense", "Richter-Veresov Attack", "Nimzo-Larsen Attack"];
  const W = {}, PLY = 16;
  const add = (uci, w) => { for (let k = 0; k < Math.min(uci.length, PLY); k++) { const key = uci.slice(0, k).join(' '), nx = uci[k]; (W[key] = W[key] || {})[nx] = (W[key][nx] || 0) + w; } };
  for (const o of all) {
    const fam = o.name.split(':')[0];
    // chỉ lấy dòng từ 6 nửa nước (dòng ngắn trong danh mục thường là khai cuộc đùa/hiếm: Arctic, Basman, Potato…)
    if (MAIN.includes(fam) && o.uci.length >= 6 && !/Gambit|Countergambit|Attack, |Wing|Folly|Potato|Drunken|Mustang|Snail|Myers|Drill|Ampel|Arctic|Basman|Herrstrom|Mujannah|Walrus|De Bruycker|St. George|Mokele|Squirrel|Woozle|Apocalypse|Gaw-Paw|Sea-Cadet|Halloween|Hamppe-Muzio|Kveinis|Godiva|Dunworthy|Lolli|Cochrane|Big Clamp|Mongredien|Brooklyn/.test(o.name.split(':')[1] || '')) add(o.uci, 1);
  }
  for (const L of lines) {
    const p = CH.Pos.fromFen(CH.START_FEN), uci = [];
    for (const t of L.moves) { const m = p.parseSan(t); uci.push(CH.mvStr(m)); p.make(m); }
    add(uci, 3);
  }
  const book = {};
  for (const key of Object.keys(W).sort()) {
    // Lấy căn bậc hai trọng số để họ có nhiều dòng trong danh mục (Sicilian…) không lấn hết các nước khác
    const sw = nx => Math.sqrt(W[key][nx]), arr = [], tot = Object.keys(W[key]).reduce((x, nx) => x + sw(nx), 0);
    for (const nx of Object.keys(W[key]).sort()) {
      const n = Math.max(1, Math.min(6, Math.round(6 * sw(nx) / tot)));
      if (sw(nx) * 20 < tot) continue;       // bỏ nước quá hiếm (dưới 5% sau khi làm phẳng)
      for (let i = 0; i < n; i++) arr.push(nx);
    }
    if (arr.length) book[key] = arr;
  }
  const openings = { groups, lines, names };
  console.log('Khai cuộc: ' + all.length + ' dòng hợp lệ, ' + lines.length + ' biến trong ' + Object.keys(groups).length + ' nhóm, sách ' + Object.keys(book).length + ' thế.');
  return { openings, book };
}

function write(name, obj) {
  fs.mkdirSync(OUT, { recursive: true });
  const s = JSON.stringify(obj);
  fs.writeFileSync(path.join(OUT, name), s + '\n');
  console.log('  ' + name + ': ' + (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB');
}

const P = readPuzzles();
if (P) { write('puzzles.json', P.mates); write('tactics.json', P.tacs); }
const O = readOpenings();
if (O) { write('openings.json', O.openings); write('book.json', O.book); }
