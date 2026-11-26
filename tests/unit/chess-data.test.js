// Kiểm tra toàn vẹn dữ liệu cờ vua trong data/chess/ (tạo bởi tools/chess/build-data.js):
// mọi bài, mọi biến khai cuộc và sách của máy phải hợp lệ theo luật CỜ VUA (src/core/chess.js), không lẫn dữ liệu cờ tướng.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const CH = require('../../src/core/chess.js');
const DIR = path.join(__dirname, '..', '..', 'data', 'chess');
const load = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const has = f => fs.existsSync(path.join(DIR, f));

function play(fen, uci) {
  const p = CH.Pos.fromFen(fen);
  for (const u of uci) { const m = p.parse(u); if (!m) return { ok: false, at: u, fen: p.fen() }; p.make(m); }
  return { ok: true, pos: p };
}

test('bài chiếu hết cờ vua: thế hợp lệ, lời giải đúng luật và kết thúc bằng chiếu hết đúng số nước', { skip: !has('puzzles.json') }, () => {
  const P = load('puzzles.json');
  assert.ok(P.length >= 50, 'quá ít bài: ' + P.length);
  const ids = new Set();
  for (const z of P) {
    assert.ok(!ids.has(z.id), 'trùng id ' + z.id); ids.add(z.id);
    assert.ok(z.n >= 1 && z.n <= 5);
    const pos = CH.Pos.fromFen(z.fen);
    assert.equal(pos.side, z.side, 'bài ' + z.id + ': sai bên đi');
    const r = play(z.fen, z.sol);
    assert.ok(r.ok, 'bài ' + z.id + ': nước ' + r.at + ' không hợp lệ');
    assert.equal(r.pos.status() && r.pos.status().result, 'mate', 'bài ' + z.id + ' không kết thúc bằng chiếu hết');
    assert.equal(Math.ceil(z.sol.length / 2), z.n, 'bài ' + z.id + ' sai số nước');
  }
});

test('bài chiến thuật cờ vua: lời giải hợp lệ, có hạng, id dạng t…', { skip: !has('tactics.json') }, () => {
  const T = load('tactics.json');
  assert.ok(T.length >= 50, 'quá ít bài: ' + T.length);
  for (const z of T) {
    assert.match(z.id, /^t\d+$/);
    assert.ok(z.r > 0 && z.r < 3500);
    assert.ok(z.side === 'w' || z.side === 'b');
    assert.equal(CH.Pos.fromFen(z.fen).side, z.side === 'w' ? 0 : 1);
    const r = play(z.fen, z.sol);
    assert.ok(r.ok, 'bài ' + z.id + ': nước ' + r.at + ' không hợp lệ');
  }
});

test('khai cuộc cờ vua: đủ nhóm, mỗi biến đi đúng luật từ thế ban đầu, tên có trong danh mục', { skip: !has('openings.json') }, () => {
  const O = load('openings.json');
  const keys = Object.keys(O.groups);
  assert.ok(keys.length >= 10, 'quá ít nhóm: ' + keys.length);
  for (const k of keys) {
    const g = O.groups[k];
    assert.ok(g.title && g.en && (g.side === 0 || g.side === 1) && Array.isArray(g.about));
    assert.ok(O.lines.some(L => L.group === k), 'nhóm ' + k + ' không có biến nào');
  }
  const ids = new Set();
  for (const L of O.lines) {
    assert.ok(!ids.has(L.id)); ids.add(L.id);
    const p = CH.Pos.fromFen(CH.START_FEN);
    for (const s of L.moves) { const m = p.parseSan(s); assert.ok(m, L.id + ': nước ' + s + ' không hợp lệ'); assert.equal(p.san(m), s); p.make(m); }
    assert.ok(O.names[L.moves.join(' ')], L.id + ': thiếu tên');
  }
});

test('sách của máy (cờ vua): mọi nước tiếp theo hợp lệ tại thế tương ứng', { skip: !has('book.json') }, () => {
  const B = load('book.json');
  assert.ok(B['']?.length > 0, 'thiếu nước mở đầu');
  for (const [key, next] of Object.entries(B)) {
    const r = play(CH.START_FEN, key ? key.split(' ') : []);
    assert.ok(r.ok, 'chuỗi "' + key + '" không hợp lệ');
    for (const u of next) assert.ok(r.pos.parse(u), 'sau "' + key + '": ' + u + ' không hợp lệ');
  }
});
