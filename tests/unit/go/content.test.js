// [CỜ VÂY] Kiểm tra nội dung luyện tập: data/go/puzzles.json (bài Bắt quân) và data/go/lessons.json (Bài học luật).
// Mỗi bài bắt quân phải bắt được đúng trong n nước (không ít hơn); mỗi bước bài học phải làm được đúng như lời dặn.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const GO = require('../../../src/go/core/go.js');
const PUZ = require('../../../data/go/puzzles.json');
const LES = require('../../../data/go/lessons.json');

test('bài bắt quân: đủ số lượng, id liên tục, mục tiêu là quân của bên không đi, bắt được đúng trong n nước', () => {
  assert.ok(PUZ.length >= 200);
  PUZ.forEach((p, i) => {
    assert.equal(p.id, i + 1);
    const pos = GO.Pos.fromFen(p.fen);
    assert.equal(pos.at(p.t), pos.side ^ 1, 'bài ' + p.id + ': mục tiêu phải là quân đối phương');
    assert.ok(p.n >= 1 && p.n <= 5);
    assert.equal(GO.captureLength(pos, p.t, p.n, 400000), p.n, 'bài ' + p.id);
  });
  for (let n = 1; n <= 5; n++) assert.ok(PUZ.filter(p => p.n === n).length >= 20, 'ít nhất 20 bài ' + n + ' nước');
});

test('bài bắt quân: máy phòng thủ trả nước hợp lệ và người giải vẫn bắt được tới cùng (thử với 40 bài)', () => {
  for (const p of PUZ.filter((_, i) => i % 6 === 0).slice(0, 40)) {
    const pos = GO.Pos.fromFen(p.fen);
    let left = p.n;
    while (pos.at(p.t) >= 0) {
      const good = GO.captureMoves(pos, p.t, left, 400000);
      assert.ok(good && good.length, 'bài ' + p.id + ': còn ' + left + ' nước mà không có nước bắt');
      pos.make(good[0]); left--;
      if (pos.at(p.t) < 0) break;
      const d = GO.bestDefense(pos, p.t, left);
      assert.ok(pos.isLegal(d)); pos.make(d);
    }
    assert.ok(left >= 0);
  }
});

test('bài học: mỗi bước làm được như lời dặn', () => {
  assert.ok(LES.length >= 8);
  for (const l of LES) for (const [k, s] of l.steps.entries()) {
    const where = 'bài ' + l.id + ' bước ' + (k + 1), p = GO.Pos.fromFen(s.fen);
    assert.ok(s.text && s.text.length > 20, where);
    for (const m of Object.keys(s.marks || {})) assert.ok(p.pointOf(m) >= 0, where + ': đánh dấu ' + m);
    if (s.goal === 'at') assert.ok(s.ok.every(x => p.parse(x)), where);
    if (s.goal === 'capture') {
      const ok = p.legalMoves().some(m => { if (m === GO.PASS) return false; const c = p.caps[p.side]; p.make(m); const r = p.caps[p.side ^ 1] > c; p.unmake(); return r; });
      assert.ok(ok, where);
    }
    if (s.goal === 'save') {
      const t = p.pointOf(s.t);
      const ok = p.legalMoves().some(m => { if (m === GO.PASS) return false; p.make(m); const r = p.at(t) >= 0 && p.libsOf(p.idx(t)).length >= 2 && GO.captureLength(p, t, 3) === 0; p.unmake(); return r; });
      assert.ok(ok, where);
    }
    if (s.goal === 'kill') assert.equal(GO.captureLength(p, p.pointOf(s.t), s.n, 400000), s.n, where);
    if (s.dead) for (const d of s.dead) assert.ok(p.at(p.pointOf(d)) >= 0, where);
  }
  // bước đếm điểm: Trắng thắng nửa điểm như lời giải thích
  const sc = GO.Pos.fromFen(LES.find(l => l.id === 10).steps[0].fen).score();
  assert.deepEqual([sc.black, sc.white], [28, 28.5]);
});
