// Kiểm tra các chế độ luyện tập: đấu máy (engine tự viết), chiếu hết, chiến thuật, khai cuộc.
'use strict';
const { test } = require('@playwright/test');
const { openApp, showTab, clickMove, expect } = require('./helpers');

test('đấu máy cấp 3: máy mở đầu theo sách, đi nước bằng cách bấm bàn cờ, máy đáp lại, đi lại được', async ({ page }) => {
  const errors = await openApp(page);
  await page.selectOption('#play-side', '1');
  await page.selectOption('#play-level', '3');
  await page.click('#play-new');
  await page.waitForFunction(() => window.__xq.Play.notes.length === 1 && !window.__xq.Play.thinking);
  const m = await page.evaluate(() => { const p = window.__xq.Play.ctx.pos; return p.parse('馬8進7') > 0 ? p.parse('馬8進7') : p.legalMoves()[0]; });
  await clickMove(page, '#play-board', 'Play', m);
  await page.waitForFunction(() => window.__xq.Play.notes.length === 3 && !window.__xq.Play.thinking, null, { timeout: 30_000 });
  await page.click('#play-undo');
  await page.waitForFunction(() => window.__xq.Play.notes.length === 1);
  expect(errors).toEqual([]);
});

test('máy đổi khai cuộc giữa các ván (ít nhất 3 cách khác nhau trong 8 ván)', async ({ page }) => {
  await openApp(page);
  await page.selectOption('#play-side', '1');
  await page.selectOption('#play-level', '3');
  await page.selectOption('#play-open', '');
  const firsts = new Set();
  for (let i = 0; i < 8; i++) {
    await page.click('#play-new');
    await page.waitForFunction(() => window.__xq.Play.notes.length >= 1);
    firsts.add(await page.evaluate(() => window.__xq.Play.notes[0]));
  }
  expect(firsts.size).toBeGreaterThanOrEqual(3);
});

test('chiếu hết: giải bài bằng cách bấm bàn cờ', async ({ page }) => {
  await openApp(page);
  await showTab(page, 'puz');
  for (const id of [1, 30, 70]) {
    await page.evaluate(i => window.__xq.Puz.open(i), id);
    for (let step = 0; step < 8; step++) {
      if (await page.evaluate(() => window.__xq.Puz.solved)) break;
      const m = await page.evaluate(() => { const P = window.__xq.Puz; return XQ.mateFirstMoves(P.ctx.pos, P.remaining)[0]; });
      await clickMove(page, '#puz-board', 'Puz', m);
      await page.waitForFunction(() => !window.__xq.Puz.busy);
    }
    expect(await page.evaluate(() => window.__xq.Puz.solved)).toBe(true);
  }
});

test('chiến thuật: nước sai bị tính lỗi, nước đúng thì giải xong', async ({ page }) => {
  await openApp(page);
  await showTab(page, 'tac');
  await page.locator('#tac-grid .pz').first().click();
  await expect(page.locator('#tac-play')).toBeVisible();
  const wrong = await page.evaluate(() => { const T = window.__xq.Tac; return T.ctx.pos.legalMoves().find(x => XQ.mvStr(x) !== T.cur.best && (T.cur.accept || []).indexOf(XQ.mvStr(x)) < 0); });
  await page.evaluate(m => window.__xq.Tac.attempt(m), wrong);
  expect(await page.evaluate(() => window.__xq.Tac.errors)).toBe(1);
  await page.waitForFunction(() => !window.__xq.Tac.busy);
  const right = await page.evaluate(() => { const T = window.__xq.Tac; return T.ctx.pos.legalMoves().find(x => XQ.mvStr(x) === T.cur.best); });
  await clickMove(page, '#tac-board', 'Tac', right);
  await page.waitForFunction(() => window.__xq.Tac.solved);
  await expect(page.locator('#tac-status')).toContainText('Đúng');
});

test('chiến thuật: chế độ 3 phút bắt đầu đếm giờ', async ({ page }) => {
  await openApp(page);
  await showTab(page, 'tac');
  await page.locator('#tac-modes .pz[data-m="t3"]').click();
  await expect(page.locator('#tac-play')).toBeVisible();
  await expect(page.locator('#tac-title')).toContainText(/3 phút/);
});

test('khai cuộc: đủ các nhóm, tập hết một biến, nước tương đương không bị tính sai', async ({ page }) => {
  await openApp(page);
  await showTab(page, 'op');
  expect(await page.locator('#op-list details').count()).toBeGreaterThanOrEqual(8);
  // tập biến a1 (Bình phong mã) đến hết
  await page.evaluate(() => window.__xq.Op.open(OPENINGS.lines.find(l => l.id === 'a1'), 'drill'));
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(async () => {
      const O = window.__xq.Op; if (O.finished) return true;
      await new Promise(r => setTimeout(r, 50));
      if (O.busy || O.ctx.pos.side !== 1) return false;
      O.userMove(O.ctx.pos.parse(O.line.moves[O.k])); return O.finished;
    });
    if (done) break;
    await page.waitForFunction(() => !window.__xq.Op.busy);
  }
  expect(await page.evaluate(() => window.__xq.Op.finished)).toBe(true);
  expect(await page.evaluate(() => window.__xq.Op.mistakes)).toBe(0);
  // biến do Pikafish sinh: thử nước tương đương ở nước 2 của Đen
  const r = await page.evaluate(async () => {
    const O = window.__xq.Op, L = OPENINGS.lines.find(l => l.id[0] === 'x' && l.pk[2] && l.pk[2].alt);
    O.open(L, 'drill'); await new Promise(res => setTimeout(res, 1200));
    O.userMove(O.ctx.pos.parse(L.pk[2].alt[0]));
    return { mistakes: O.mistakes, note: O.noteText };
  });
  expect(r.mistakes).toBe(0);
  expect(r.note).toContain('cũng là nước tốt');
});
