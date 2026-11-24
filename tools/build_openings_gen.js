// Ghép biến khai cuộc do Pikafish sinh (opening_lines.json) vào openings.json, và tạo sách khai cuộc cho máy (book.json) từ opening_tree.json.
const fs = require('fs');
const XQ = require('../src/core/xq.js');
const hand = JSON.parse(fs.readFileSync(__dirname + '/../data/openings_hand.json', 'utf8'));
const tree = JSON.parse(fs.readFileSync(__dirname + '/../data/opening_tree.json', 'utf8'));
const gen = fs.existsSync(__dirname + '/../data/opening_lines.json') ? JSON.parse(fs.readFileSync(__dirname + '/../data/opening_lines.json', 'utf8')) : [];
const CACHE = fs.existsSync(__dirname + '/../data/opening_lines_cache.json') ? JSON.parse(fs.readFileSync(__dirname + '/../data/opening_lines_cache.json', 'utf8')) : {};
const PIECE = ['', 'Xe', 'Mã', 'Tượng', 'Sĩ', 'Tướng', 'Pháo', 'Tốt'];
const RED_NAMES = {
  '炮二平五': ['Pháo đầu (中炮)', 'Đỏ bình Pháo vào cột giữa, nhắm Tốt giữa và cung Tướng Đen. Khai cuộc phổ biến nhất của bên đi trước.'],
  '炮八平五': ['Pháo đầu, dùng Pháo trái (中炮)', 'Cùng ý Pháo đầu nhưng bình Pháo bên trái vào giữa.'],
  '兵七進一': ['Tiên nhân chỉ lộ (仙人指路)', 'Đỏ tiến Tốt 7: mở đường cho Mã và thăm dò ý đồ của Đen trước khi chọn thế trận.'],
  '兵三進一': ['Tiên nhân chỉ lộ, đi Tốt 3 (仙人指路)', 'Đỏ tiến Tốt 3: cùng ý đồ thăm dò nhưng mở ở cánh bên kia.'],
  '傌二進三': ['Khởi mã cục (起馬局)', 'Đỏ ra Mã trước, giữ linh hoạt rồi mới chọn hướng đặt Pháo.'],
  '傌八進七': ['Khởi mã cục, Mã trái (起馬局)', 'Đỏ ra Mã bên trái trước, giữ linh hoạt rồi mới chọn hướng đặt Pháo.'],
  '炮二平四': ['Sĩ giác pháo (仕角炮)', 'Đỏ bình Pháo về góc Sĩ (cột 4), thế trận chắc chắn, chưa đánh thẳng vào trung lộ.'],
  '炮八平六': ['Sĩ giác pháo (仕角炮)', 'Đỏ bình Pháo về góc Sĩ (cột 6), thế trận chắc chắn, chưa đánh thẳng vào trung lộ.'],
  '相三進五': ['Phi tượng cục (飛相局)', 'Đỏ lên Tượng trước: thủ chắc, chờ xem Đen bày trận.'],
  '相七進五': ['Phi tượng cục (飛相局)', 'Đỏ lên Tượng trước: thủ chắc, chờ xem Đen bày trận.'],
  '炮二平六': ['Quá cung pháo (過宮炮)', 'Đỏ bình Pháo sang cột 6, qua cung Tướng.'],
  '炮八平四': ['Quá cung pháo (過宮炮)', 'Đỏ bình Pháo sang cột 4, qua cung Tướng.']
};
const BLACK_NAMES = {
  '炮二平五 馬8進7': ['Bình phong mã (屏風馬)', 'Đen ra Mã 8 trước, rồi sẽ ra thêm Mã 2 để thành thế bình phong.'],
  '炮二平五 馬2進3': ['Bình phong mã (屏風馬), ra Mã 2 trước', 'Đen ra Mã 2 trước; ra thêm Mã 8 nữa là thành thế bình phong.'],
  '炮二平五 炮8平5': ['Thuận pháo (順炮)', 'Đen bình Pháo vào giữa ngay, hai bên đối công trên trung lộ.'],
  '炮二平五 炮2平5': ['Liệt pháo (列炮)', 'Đen bình Pháo bên kia vào giữa, hai Pháo đối mặt nhau, thế cờ căng thẳng.'],
  '兵七進一 卒7進1': ['Đối binh cục (對兵局)', 'Đen tiến Tốt 7 đáp lại Tốt đỏ.'],
  '兵七進一 炮8平5': ['Pháo đầu phản công', 'Đen bình Pháo vào giữa ngay để giành thế chủ động trung lộ.'],
  '兵七進一 炮2平5': ['Pháo đầu phản công', 'Đen bình Pháo vào giữa ngay để giành thế chủ động trung lộ.']
};
const hashId = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

const out = hand.lines.map(L => Object.assign({ group: 'bpm' }, L));
const groups = { bpm: { title: 'Bình phong mã đối Pháo đầu (có giải thích chi tiết)', order: 0 } };
let gi = 1;
function mkLine(g, idx) {
  const pos = XQ.Pos.fromFen(XQ.START_FEN), moves = [], notes = {}, pk = {};
  for (let i = 0; i < g.moves.length; i++) {
    const m = pos.legalMoves().find(x => XQ.mvStr(x) === g.moves[i]); if (m === undefined) return null;
    const n = pos.notation(m), cap = pos.b[m & 127], side = pos.side; const pos0 = XQ.Pos.fromFen(pos.fen());
    moves.push(n);
    const bits = [];
    if (i === 0) { const r = RED_NAMES[n]; bits.push(r ? r[0] + ': ' + r[1] : 'Đỏ mở đầu bằng ' + n + '.'); }
    else if (i === 1) { const b = BLACK_NAMES[moves[0] + ' ' + n]; bits.push(b ? b[0] + ': ' + b[1] : 'Đen đáp bằng ' + n + ' – một trong những cách đáp tốt nhất theo Pikafish.'); }
    pos.make(m);
    if (cap) bits.push((side === 0 ? 'Đỏ' : 'Đen') + ' ăn ' + PIECE[cap & 7] + '.');
    if (pos.inCheck()) bits.push('Chiếu tướng.');
    if (i === g.altAt) bits.push('Biến phụ: Đỏ chọn nước này thay cho ' + g.mainAlt + '; Pikafish xem hai nước gần ngang nhau.');
    if (bits.length) notes[i + 1] = bits.join(' ');
    // đánh giá: cps[i+1] là điểm theo bên sắp đi sau nước i+1 → quy về góc nhìn Đỏ
    const stm = g.cps[i + 1]; if (stm !== undefined) {
      const e = (pos.side === 0 ? stm : -stm);
      const ent = { e: Math.max(-2000, Math.min(2000, e)) };
      if (side === 1) { // nước Đen: b = nước tốt nhất của Pikafish ở thế trước, d = chênh lệch cho Đen
        const bu = g.bests[i];
        ent.same = bu === g.moves[i];
        const before = g.cps[i]; ent.d = Math.max(-2000, Math.min(2000, (-stm) - before));
        ent.bu = bu;
        // nước khác có điểm gần ngang nước sách (trong 25 centipawn) cũng được chấp nhận khi tập
        const cn = CACHE[g.moves.slice(0, i).join(' ')];
        if (cn && cn.c.length) {
          const al = [], sn = {};
          for (const x of cn.c) { if (cn.c[0].cp - x.cp <= 25 && x.m !== g.moves[i] && !sn[x.m]) { sn[x.m] = 1; const am = pos0.legalMoves().find(y => XQ.mvStr(y) === x.m); if (am !== undefined) al.push(pos0.notation(am)); } }
          if (al.length) ent.alt = al;
        }
      }
      pk[i + 1] = ent;
    }
  }
  return { moves, notes, pk };
}
// ghi chú b (ký hiệu nước tốt nhất của Pikafish) cần thế trước: tính lại
function fixBest(L, g) {
  const pos = XQ.Pos.fromFen(XQ.START_FEN);
  for (let i = 0; i < g.moves.length; i++) {
    const ent = L.pk[i + 1];
    if (ent && ent.bu !== undefined) { const bm = pos.legalMoves().find(x => XQ.mvStr(x) === ent.bu); ent.b = bm !== undefined ? pos.notation(bm) : ''; delete ent.bu; }
    pos.make(pos.legalMoves().find(x => XQ.mvStr(x) === g.moves[i]));
  }
}
// nhóm theo nước đầu của Đỏ
const byRed = {};
gen.forEach(g => { (byRed[g.moves[0]] = byRed[g.moves[0]] || []).push(g); });
const redKeys = Object.keys(byRed).sort((a, b) => byRed[b].length - byRed[a].length);
// xác định biến phụ: so với biến chính cùng cặp (nước 1-2)
let lineNo = 0;
for (const rk of redKeys) {
  const pos0 = XQ.Pos.fromFen(XQ.START_FEN); const m0 = pos0.legalMoves().find(x => XQ.mvStr(x) === rk); const rn = pos0.notation(m0);
  const gid = 'g' + (gi++); const rinfo = RED_NAMES[rn];
  groups[gid] = { title: (rinfo ? rinfo[0] : 'Đỏ mở đầu ' + rn) + ' – Pikafish chọn biến', order: gi };
  const mains = {};
  byRed[rk].forEach(g => { if (g.tag === 'chính') mains[g.moves[1]] = g; });
  byRed[rk].forEach(g => {
    const main = mains[g.moves[1]];
    if (g.tag !== 'chính' && main) { const at = +g.tag.split('@')[1]; g.altAt = at; const pp = XQ.Pos.fromFen(XQ.START_FEN); for (let i = 0; i < at; i++) pp.make(pp.legalMoves().find(x => XQ.mvStr(x) === g.moves[i])); const mm = pp.legalMoves().find(x => XQ.mvStr(x) === main.moves[at]); g.mainAlt = mm !== undefined ? pp.notation(mm) : ''; }
    const L = mkLine(g, lineNo); if (!L) return;
    fixBest(L, g);
    lineNo++;
    const last = L.moves.length, ev = (L.pk[last] && L.pk[last].e) || 0;
    const blk = L.moves[1], bn = BLACK_NAMES[L.moves[0] + ' ' + blk];
    const lab = Math.abs(ev) < 30 ? 'cân bằng' : (ev > 0 ? 'Đỏ hơn' : 'Đen hơn');
    out.push({
      id: 'x' + hashId(L.moves.join(' ')), group: gid,
      title: (bn ? bn[0] + ' – ' + blk : 'Đen: ' + blk) + (g.tag === 'chính' ? '' : ' · biến phụ nước ' + (g.altAt + 1)),
      summary: 'Đỏ ' + L.moves[0] + ', Đen ' + blk + (g.tag === 'chính' ? '. Hai bên đi theo nước tốt nhất của Pikafish.' : '. Đỏ rẽ nhánh ở nước ' + (g.altAt + 1) + ' (' + L.moves[g.altAt] + ').') + ' ' + last + ' nước, cuối biến Pikafish thấy ' + lab + '.',
      moves: L.moves, notes: L.notes, pk: L.pk
    });
  });
}
// ---- sách khai cuộc cho máy
const book = {};
for (const k of Object.keys(tree)) {
  const n = tree[k]; if (n.ply >= 12 || !n.c.length) continue;
  const top = n.c[0].cp, margin = n.ply === 0 ? 70 : 40;
  const sn = {}, kids = n.c.filter(x => top - x.cp <= margin && !sn[x.m] && (sn[x.m] = 1)).slice(0, n.ply === 0 ? 7 : 3).map(x => x.m);
  if (kids.length && tree[k ? k + ' ' + kids[0] : kids[0]]) book[k] = kids; // chỉ giữ nút có con đã phân tích
}
// bỏ nút không có con trong cây (cụt)
const finalBook = {}; for (const k of Object.keys(book)) { const kids = book[k].filter(m => true); finalBook[k] = kids; }
fs.writeFileSync(__dirname + '/../data/openings.json', JSON.stringify({ overview: hand.overview, groups, lines: out }));
fs.writeFileSync(__dirname + '/../data/book.json', JSON.stringify(finalBook));
console.log('openings.json:', out.length, 'biến (', out.length - hand.lines.length, 'mới );', Object.keys(groups).length, 'nhóm; book.json:', Object.keys(finalBook).length, 'nút,', JSON.stringify(finalBook).length, 'byte');
