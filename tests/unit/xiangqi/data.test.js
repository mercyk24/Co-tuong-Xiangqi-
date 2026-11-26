// Kiểm tra toàn vẹn dữ liệu cờ tướng trong data/xiangqi/: mọi bài, mọi biến khai cuộc và sách khai cuộc phải hợp lệ theo luật.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const XQ = require('../../../src/xiangqi/core/xq.js');
const load = f => require('../../../data/xiangqi/' + f);

function play(fen, uciOrHan) {
  const p = XQ.Pos.fromFen(fen);
  for (const t of uciOrHan) {
    const m = /^[a-i]\d[a-i]\d$/.test(t) ? p.legalMoves().find(x => XQ.mvStr(x) === t) : p.parse(t);
    if (m === undefined || m <= 0) return { ok: false, at: t, fen: p.fen() };
    p.make(m);
  }
  return { ok: true, pos: p };
}

test('bài chiếu hết: thế hợp lệ và có chiếu hết đúng số nước đã ghi', () => {
  const P = load('puzzles.json');
  assert.ok(P.length >= 50);
  const ids = new Set();
  for (const z of P) {
    assert.ok(!ids.has(z.id), 'trùng id ' + z.id); ids.add(z.id);
    const pos = XQ.Pos.fromFen(z.fen);
    assert.ok(pos.legalMoves().length > 0, 'bài ' + z.id + ' không có nước đi');
    assert.equal(XQ.mateLength(pos, z.n), z.n, 'bài ' + z.id + ' không chiếu hết trong đúng ' + z.n + ' nước');
  }
});

test('bài chiến thuật: nước đáp án hợp lệ, có hạng và lời giải', () => {
  const T = load('tactics.json');
  assert.ok(T.length >= 50);
  for (const t of T) {
    const r = play(t.fen, [t.best]);
    assert.ok(r.ok, 'bài ' + t.id + ': nước ' + t.best + ' không hợp lệ');
    assert.ok(t.rating >= 400 && t.rating <= 3000, 'bài ' + t.id + ' hạng lạ ' + t.rating);
    assert.ok(Array.isArray(t.pv) && t.pv[0] === t.best, 'bài ' + t.id + ' pv không bắt đầu bằng đáp án');
  }
});

test('biến khai cuộc: mọi nước đi hợp lệ, ghi chú và đánh giá trỏ đúng nước', () => {
  const O = load('openings.json');
  assert.ok(O.lines.length >= 6);
  const ids = new Set();
  for (const L of O.lines) {
    assert.ok(!ids.has(L.id), 'trùng id ' + L.id); ids.add(L.id);
    const r = play(XQ.START_FEN, L.moves);
    assert.ok(r.ok, 'biến ' + L.id + ' sai ở nước ' + r.at);
    for (const k of Object.keys(L.notes || {})) assert.ok(+k >= 0 && +k <= L.moves.length, 'biến ' + L.id + ' ghi chú ở nước ' + k);
    if (L.group) assert.ok(O.groups && O.groups[L.group] || L.group === 'bpm', 'biến ' + L.id + ' thuộc nhóm lạ ' + L.group);
  }
});

test('sách khai cuộc của máy: mọi nước trong sách hợp lệ ở thế tương ứng', () => {
  const B = load('book.json');
  let n = 0;
  for (const [key, moves] of Object.entries(B)) {
    const r = play(XQ.START_FEN, key ? key.split(' ') : []);
    assert.ok(r.ok, 'khoá sách hỏng: ' + key);
    const legal = new Set(r.pos.legalMoves().map(XQ.mvStr));
    for (const u of moves) { assert.ok(legal.has(u), 'nước ' + u + ' không hợp lệ sau "' + key + '"'); n++; }
  }
  assert.ok(n > 500);
});
