const XQ = require('../../src/xiangqi/core/xq.js');
const { LINES, OVERVIEW } = require('../../data/xiangqi/openings_src.js');
const out = [];
const S = new XQ.Searcher();
// Kết quả Pikafish (tìm 1,2 giây mỗi thế): khoá = chuỗi nước UCI
const PK = {};
{
  const t = require('fs').readFileSync(__dirname + '/../../data/xiangqi/pikafish_results.txt', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let i = 0; i < t.length; i++) {
    if (t[i].startsWith('### ') && t[i].includes('|') && !t[i].startsWith('### engine')) {
      const parts = t[i].slice(4).split('|').map(x => x.trim());
      const info = t[i + 1] || '', best = t[i + 2] || '';
      const m = info.match(/score cp (-?\d+)/);
      if (m && best.startsWith('bestmove')) PK[parts[1]] = { cp: +m[1], best: best.split(/\s+/)[1] };
    }
  }
}
for (const L of LINES) {
  const pos = XQ.Pos.fromFen(XQ.START_FEN);
  const toks = L.moves.trim().split(/\s+/);
  const res = [];
  for (let i = 0; i < toks.length; i++) {
    const m = pos.parse(toks[i]);
    if (m < 0) { console.error('KHÔNG HỢP LỆ', L.id, 'ply', i + 1, toks[i], pos.fen()); process.exit(1); }
    const canon = pos.notation(m);
    pos.make(m);
    S.clear();
    const r = S.search(pos, { maxDepth: 5, timeMs: 1500 });
    // điểm theo góc nhìn Đỏ
    const redScore = pos.side === 0 ? r.score : -r.score;
    res.push({ n: canon, ev: redScore });
  }
  // gắn đánh giá Pikafish: e = điểm theo góc nhìn Đỏ sau nước đó; với nước Đen thêm b (nước Pikafish chọn), d (chênh lệch cho Đen), same
  const pk = {};
  {
    const p2 = XQ.Pos.fromFen(XQ.START_FEN); const uci = [];
    for (let i = 0; i < toks.length; i++) {
      const before = uci.join(' ');
      const m = p2.parse(toks[i]); const u = XQ.mvStr(m);
      const bi = PK[before];
      uci.push(u);
      const af = PK[uci.join(' ')];
      if (af) {
        const ply = i + 1, e = (ply % 2 === 0) ? af.cp : -af.cp; // sau nước chẵn (Đen vừa đi) thì Đỏ đi: cp là của Đỏ
        const ent = { e };
        if (ply % 2 === 0 && bi) {
          const bm = p2.legalMoves().find(x => XQ.mvStr(x) === bi.best);
          ent.b = bm ? p2.notation(bm) : '';
          ent.d = (-af.cp) - bi.cp; ent.same = bi.best === u;
        }
        pk[ply] = ent;
      }
      p2.make(m);
    }
  }
  const evs = res.map(x => x.ev);
  console.log(L.id, 'OK', toks.length, 'nước; eval (Đỏ, centipawn):', evs.join(' '));
  out.push({ id: L.id, title: L.title, summary: L.summary, moves: res.map(x => x.n), notes: L.notes, pk });
}
require('fs').writeFileSync(__dirname + '/../../data/xiangqi/openings_hand.json', JSON.stringify({ overview: OVERVIEW, lines: out }));
console.log('đã ghi data/xiangqi/openings_hand.json');
