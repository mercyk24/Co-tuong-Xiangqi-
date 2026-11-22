const XQ = require('./xq.js');
const { LINES, OVERVIEW } = require('./openings_src.js');
const out = [];
const S = new XQ.Searcher();
for (const L of LINES) {
  const pos = XQ.Pos.fromFen(XQ.START_FEN);
  const toks = L.moves.trim().split(/\s+/);
  const res = [];
  let prevEval = null;
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
  const evs = res.map(x => x.ev);
  console.log(L.id, 'OK', toks.length, 'nước; eval (Đỏ, centipawn):', evs.join(' '));
  out.push({ id: L.id, title: L.title, summary: L.summary, moves: res.map(x => x.n), notes: L.notes });
}
require('fs').writeFileSync(__dirname + '/openings.json', JSON.stringify({ overview: OVERVIEW, lines: out }));
console.log('đã ghi openings.json');
