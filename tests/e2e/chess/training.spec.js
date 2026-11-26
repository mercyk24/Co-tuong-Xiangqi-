// CỜ VUA – các tab luyện tập: chiếu hết (kho Lichess), chiến thuật, khai cuộc, phân tích ván.
'use strict';
const { test } = require('@playwright/test');
const { expect, showTab } = require('../helpers');

test.describe.configure({ timeout: 90_000 });

async function openChess(page) {
  await page.goto('co-vua/index.html');
  await page.waitForFunction(() => window.crossOriginIsolated === true && window.__xc && window.__xc.Play, null, { timeout: 20_000 });
}
// Bấm nước (UCI, ví dụ 'e2e4') trên bàn cờ của một tab
async function tapMove(page, boardSel, obj, uci) {
  for (const name of [uci.slice(0, 2), uci.slice(2, 4)]) {
    const pt = await page.evaluate(([sel, o, n]) => {
      const b = window.__xc[o].board, s = CH.sqParse(n), r = document.querySelector(sel + ' svg').getBoundingClientRect();
      return { x: r.left + (b.X(CH.COL(s)) + b.cell / 2) * r.width / b.W, y: r.top + (b.Y(CH.ROW(s)) + b.cell / 2) * r.height / b.H };
    }, [boardSel, obj, name]);
    await page.mouse.click(pt.x, pt.y);
  }
  // Phong cấp: bảng chọn quân hiện ngay dưới bàn cờ luyện tập
  if (uci.length === 5) await page.click('#promo-x [data-t="' + { q: 5, r: 4, b: 3, n: 2 }[uci[4]] + '"]');
}
const ids = (page, sel) => page.evaluate(s => Array.from(document.querySelectorAll(s)).length, sel);

test('chiếu hết (cờ vua): giải bài 1, 2 và 3 nước bằng cách bấm bàn cờ', async ({ page }) => {
  await openChess(page);
  await showTab(page, 'puz');
  const pick = await page.evaluate(() => [1, 2, 3].map(n => (PUZZLES.find(p => p.n === n) || {}).id).filter(Boolean));
  test.skip(!pick.length, 'chưa có dữ liệu bài tập (chạy tools/chess/fetch-data.mjs rồi build-data.js)');
  for (const id of pick) {
    await page.evaluate(i => window.__xc.Puz.open(i), id);
    for (let step = 0; step < 6; step++) {
      if (await page.evaluate(() => window.__xc.Puz.solved)) break;
      const u = await page.evaluate(() => { const P = window.__xc.Puz; return P.cur.sol[P.k]; });
      await tapMove(page, '#puz-board', 'Puz', u);
      await page.waitForFunction(() => !window.__xc.Puz.busy);
    }
    expect(await page.evaluate(() => ({ s: window.__xc.Puz.solved, e: window.__xc.Puz.errors, mate: window.__xc.Puz.ctx.pos.status().result }))).toEqual({ s: true, e: 0, mate: 'mate' });
  }
});

test('chiến thuật (cờ vua): nước sai bị tính lỗi, đi đúng cả chuỗi thì giải xong', async ({ page }) => {
  await openChess(page);
  await showTab(page, 'tac');
  test.skip(await page.evaluate(() => !TACTICS.length), 'chưa có dữ liệu chiến thuật');
  expect(await ids(page, '#tac-grid .pz')).toBeGreaterThan(0);
  await page.locator('#tac-grid .pz').first().click();
  await expect(page.locator('#tac-play')).toBeVisible();
  const wrong = await page.evaluate(() => { const T = window.__xc.Tac, pos = T.ctx.pos; return pos.legalMoves().find(x => { if (CH.mvStr(x) === T.sol(T.cur)[0]) return false; pos.make(x); const mate = (pos.status() || {}).result === 'mate'; pos.unmake(x); return !mate; }); });
  await page.evaluate(m => window.__xc.Tac.attempt(m), wrong);
  expect(await page.evaluate(() => window.__xc.Tac.errors)).toBe(1);
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(() => window.__xc.Tac.solved)) break;
    const u = await page.evaluate(() => { const T = window.__xc.Tac; return T.sol(T.cur)[T.k]; });
    await tapMove(page, '#tac-board', 'Tac', u);
    await page.waitForFunction(() => !window.__xc.Tac.busy);
  }
  expect(await page.evaluate(() => window.__xc.Tac.solved)).toBe(true);
});

test('khai cuộc (cờ vua): đủ nhóm, tập hết một biến của Trắng và một biến của Đen không sai nước nào', async ({ page }) => {
  await openChess(page);
  await showTab(page, 'op');
  test.skip(await page.evaluate(() => !OPENINGS.lines.length), 'chưa có dữ liệu khai cuộc');
  expect(await ids(page, '#op-list details')).toBeGreaterThanOrEqual(10);
  for (const side of [0, 1]) {
    await page.evaluate(s => { const L = OPENINGS.lines.find(l => OPENINGS.groups[l.group].side === s); window.__xc.Op.open(L, 'drill'); }, side);
    for (let i = 0; i < 20; i++) {
      await page.waitForFunction(() => { const O = window.__xc.Op; return O.finished || (!O.busy && O.ctx.pos.side === O.side); });
      const st = await page.evaluate(() => { const O = window.__xc.Op; return { f: O.finished, u: O.line.moves[O.k] }; });
      if (st.f) break;
      const uci = await page.evaluate(san => CH.mvStr(window.__xc.Op.ctx.pos.parseSan(san)), st.u);
      await tapMove(page, '#op-board', 'Op', uci);
    }
    expect(await page.evaluate(() => ({ f: window.__xc.Op.finished, m: window.__xc.Op.mistakes }))).toEqual({ f: true, m: 0 });
  }
});

test('phân tích ván (cờ vua): phát hiện nước bỏ Hậu, đưa vào "Lỗi của bạn"', async ({ page }) => {
  test.setTimeout(150_000);
  await openChess(page);
  // Ván hai người, 6 nước mỗi bên: Trắng đưa Hậu tới g4 (6.Qg4??) để Mã f6 ăn không
  await page.evaluate(() => window.__xc.Store.set('ana_mode', 'fast'));
  await page.click('.mode[data-m="pvp"]');
  await page.click('#pvp-times .btn[data-k="0"]');
  await page.evaluate(() => { const P = window.__xc.Play; for (const u of 'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 d1g4 f6g4'.split(' ')) P.doMove(P.ctx.pos.parse(u), true); });
  await page.evaluate(() => window.__xc.Ana.openCurrent());
  await page.waitForFunction(() => { const g = window.__xc.Ana.cur; return g && g.ana; }, null, { timeout: 120_000 });
  const r = await page.evaluate(() => { const g = window.__xc.Ana.cur; return { ls: g.ana.ls, mine: window.__xc.Tac.mine.length }; });
  expect(r.ls[10]).toBeGreaterThanOrEqual(300);      // 6.Qg4?? bỏ Hậu: sai lầm nặng
  expect(Math.max(...r.ls.slice(0, 10))).toBeLessThan(150);
  expect(r.mine).toBeGreaterThan(0);
});

test('chiến thuật (cờ vua): bài có phong cấp hỏi chọn quân; chọn sai quân bị tính lỗi, chọn đúng thì đi tiếp', async ({ page }) => {
  await openChess(page);
  await showTab(page, 'tac');
  // bài có nước phong Hậu ở lượt của người giải (nước chẵn trong lời giải)
  const pick = await page.evaluate(() => {
    for (const t of TACTICS) { const k = t.sol.findIndex((u, i) => i % 2 === 0 && u.length === 5 && u[4] === 'q'); if (k >= 0) return { id: t.id, k }; }
    return null;
  });
  test.skip(!pick, 'không có bài nào phong cấp');
  await page.evaluate(i => window.__xc.Tac.open(i), pick.id);
  for (let i = 0; i < pick.k; i += 2) {             // đi đúng các nước trước đó
    await page.evaluate(() => { const T = window.__xc.Tac; T.attempt(T.ctx.pos.parse(T.cur.sol[T.k])); });
    await page.waitForFunction(() => !window.__xc.Tac.busy);
  }
  const u = await page.evaluate(() => window.__xc.Tac.cur.sol[window.__xc.Tac.k]);
  expect(u).toMatch(/q$/);
  // chọn Mã thay vì Hậu: sai (trừ khi phong Mã cũng chiếu hết ngay)
  await tapMove(page, '#tac-board', 'Tac', u.slice(0, 4) + 'n');
  await expect(page.locator('#promo-x')).toHaveCount(0);
  const e1 = await page.evaluate(k0 => ({ e: window.__xc.Tac.errors, k: window.__xc.Tac.k - k0 }), pick.k);
  expect(e1.e + Math.min(1, e1.k)).toBe(1);
  if (e1.e === 1) {
    await tapMove(page, '#tac-board', 'Tac', u);
    const r = await page.evaluate(k0 => ({ e: window.__xc.Tac.errors, k: window.__xc.Tac.k - k0 }), pick.k);
    expect(r.e).toBe(1);
    expect(r.k).toBeGreaterThanOrEqual(1);
  }
});


test('danh sách bài dài vẽ từng phần: 60 thẻ, "Xem thêm" vẽ tiếp, bấm thẻ ở phần sau vẫn mở đúng bài', async ({ page }) => {
  await openChess(page);
  await showTab(page, 'puz');
  const total = await page.evaluate(() => { window.__xc.Puz.filter = 0; window.__xc.Puz.renderList(); return PUZZLES.length; });
  test.skip(total <= 60, 'ít bài, không cần chia phần');
  await expect(page.locator('#puz-grid .pz')).toHaveCount(60);
  await expect(page.locator('#puz-grid .more')).toContainText('còn ' + (total - 60) + ' bài');
  await page.click('#puz-grid .more');
  await expect(page.locator('#puz-grid .pz')).toHaveCount(Math.min(120, total));
  const id = await page.locator('#puz-grid .pz').nth(100).getAttribute('data-id');
  await page.locator('#puz-grid .pz').nth(100).click();
  await expect(page.locator('#puz-play')).toBeVisible();
  expect(await page.evaluate(() => String(window.__xc.Puz.cur.id))).toBe(id);
  // Đã giải 70 bài đầu: lần mở danh sách sau vẽ đủ để thấy bài chưa giải đầu tiên
  await page.evaluate(() => { const P = window.__xc.Puz; P.done = {}; PUZZLES.slice(0, 70).forEach(p => { P.done[p.id] = 1; }); P.showList(); });
  await expect(page.locator('#puz-grid .pz')).toHaveCount(Math.min(120, total));
  await page.evaluate(() => { window.__xc.Puz.done = window.__xc.Store.get('puz_done', {}); });
});
