// Kiểm tra chế độ hai người chơi trên một máy.
'use strict';
const { test } = require('@playwright/test');
const { openApp, clickMove, expect } = require('./helpers');

const P = page => page.evaluate(() => {
  const p = window.__xq.Play;
  return { n: p.notes.length, notes: p.notes.slice(), side: p.ctx.pos.side, flip: p.board.flip, over: p.over, thinking: p.thinking };
});
const mv = (page, s) => page.evaluate(x => window.__xq.Play.ctx.pos.parse(x), s);

test('hai người: hai bên cùng đi bằng bàn cờ, máy không tự đi, bàn lật theo lượt, đi lại 1 nước', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#play-mode .btn[data-m="pvp"]').click();
  await expect(page.locator('#play-title')).toHaveText('Hai người chơi');
  await expect(page.locator('#play-set-ai')).toBeHidden();
  await expect(page.locator('#play-hint')).toBeHidden();
  await page.selectOption('#play-orient', 'turn');
  expect((await P(page)).flip).toBe(false);
  await clickMove(page, '#play-board', 'Play', await mv(page, '炮二平五'));
  let s = await P(page);
  expect(s.n).toBe(1); expect(s.side).toBe(1); expect(s.flip).toBe(true);
  await clickMove(page, '#play-board', 'Play', await mv(page, '馬8進7'));
  await clickMove(page, '#play-board', 'Play', await mv(page, '傌二進三'));
  await page.waitForTimeout(800);
  s = await P(page);
  expect(s.notes).toEqual(['炮二平五', '馬8進7', '傌二進三']);
  expect(s.flip).toBe(true);
  await expect(page.locator('#play-status')).toContainText('Lượt Đen');
  await page.click('#play-undo');
  s = await P(page);
  expect(s.n).toBe(2); expect(s.side).toBe(0); expect(s.flip).toBe(false);
  expect(errors).toEqual([]);
});

test('hai người: xin hòa và chịu thua', async ({ page }) => {
  await openApp(page);
  await page.locator('#play-mode .btn[data-m="pvp"]').click();
  await page.evaluate(() => { const p = window.__xq.Play; p.doMove(p.ctx.pos.parse('炮二平五'), true); p.doMove(p.ctx.pos.parse('馬8進7'), true); });
  await page.click('#play-draw');
  await expect(page.locator('#play-ask-text')).toHaveText('Đỏ xin hòa. Đen có đồng ý không?');
  await page.click('#play-ask-no');
  await expect(page.locator('#play-ask')).toBeHidden();
  await page.click('#play-draw');
  await page.click('#play-ask-yes');
  expect((await P(page)).over).toContain('Hòa');
  await page.click('#play-new');
  await page.evaluate(() => { const p = window.__xq.Play; p.doMove(p.ctx.pos.parse('炮二平五'), true); });
  await page.click('#play-resign');
  await expect(page.locator('#play-ask-text')).toHaveText('Đen chịu thua?');
  await page.click('#play-ask-yes');
  expect((await P(page)).over).toBe('Đen chịu thua – Đỏ thắng.');
  await expect(page.locator('#play-status')).toContainText('Đỏ thắng');
});

test('hai người: đồng hồ chạy, cộng giờ mỗi nước, hết giờ thì thua', async ({ page }) => {
  await openApp(page);
  await page.locator('#play-mode .btn[data-m="pvp"]').click();
  await page.selectOption('#play-orient', 'fixed');
  await page.selectOption('#play-clock', '3+2');
  await expect(page.locator('#play-clk-bot')).toHaveText('Đỏ 3:00');
  await expect(page.locator('#play-clk-top')).toHaveText('Đen 3:00');
  await page.evaluate(() => { const p = window.__xq.Play; p.doMove(p.ctx.pos.parse('炮二平五'), true); });
  await page.waitForTimeout(1600);
  const left = await page.evaluate(() => window.__xq.Play.clock.left.slice());
  expect(left[0]).toBe(180000); // nước đầu tiên: đồng hồ bắt đầu chạy từ đây, chưa trừ cũng chưa cộng giờ
  expect(left[1]).toBeLessThan(179000);
  await expect(page.locator('#play-clk-top')).toHaveClass(/on/);
  await page.evaluate(() => { window.__xq.Play.clock.left[1] = 300; });
  await page.waitForFunction(() => !!window.__xq.Play.over);
  expect((await P(page)).over).toBe('Đen hết giờ – Đỏ thắng.');
});

test('hai người: chế độ đối mặt xoay quân Đen ngược lại', async ({ page }) => {
  await openApp(page);
  await page.locator('#play-mode .btn[data-m="pvp"]').click();
  await page.selectOption('#play-orient', 'face');
  const rot = await page.evaluate(() => ({
    black: document.querySelectorAll('#play-board g.pc.b[transform*="rotate(180)"]').length,
    red: document.querySelectorAll('#play-board g.pc.r[transform*="rotate(180)"]').length
  }));
  expect(rot).toEqual({ black: 16, red: 0 });
  await page.evaluate(() => { const p = window.__xq.Play; p.doMove(p.ctx.pos.parse('炮二平五'), true); });
  expect((await P(page)).flip).toBe(false);
});

test('chuyển lại "Đấu với máy" thì máy đi tiếp như cũ', async ({ page }) => {
  await openApp(page);
  await page.locator('#play-mode .btn[data-m="pvp"]').click();
  await page.locator('#play-mode .btn[data-m="ai"]').click();
  await page.selectOption('#play-side', '1');
  await page.selectOption('#play-level', '2');
  await page.click('#play-new');
  await page.waitForFunction(() => window.__xq.Play.notes.length === 1);
  await expect(page.locator('#play-title')).toHaveText('Đấu với máy');
});
