// Kiểm tra cơ bản: app tải được, các tab hoạt động, chạy ngoại tuyến, cách ghi nước đi, sao lưu.
'use strict';
const { test } = require('@playwright/test');
const { openApp, showTab, expect } = require('./helpers');
const pkg = require('../../package.json');

test('tải app, đủ 5 tab, hiện đúng phiên bản, không lỗi JavaScript', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page).toHaveTitle(/Cờ Tướng/);
  for (const t of ['play', 'puz', 'tac', 'op', 'about']) await showTab(page, t);
  await expect(page.locator('#app-version')).toContainText('Phiên bản ' + pkg.version);
  expect(await page.evaluate(() => window.__xq.version)).toBe(pkg.version);
  expect(errors).toEqual([]);
});

test('sau lần mở đầu, app vẫn mở được khi mất mạng', async ({ page, context }) => {
  await openApp(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__xq && window.__xq.Play);
  await expect(page.locator('#play-board svg')).toBeVisible();
  await context.setOffline(false);
});

test('cách ghi nước đi: mặc định tiếng Việt, đổi được sang chữ Hán', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { const P = window.__xq.Play; P.level = 1; P.user = 1; P.newGame(); });
  await page.evaluate(() => { const P = window.__xq.Play; P.thinking = false; });
  // Ván mới không có nước nào: tự đi một nước Đỏ rồi xem danh sách
  await page.evaluate(() => { const P = window.__xq.Play; P.gen++; P.user = 0; P.newGame(); P.doMove(P.ctx.pos.parse('炮二平五'), true); });
  await expect(page.locator('#play-moves')).toContainText('Pháo 2 bình 5');
  await showTab(page, 'about');
  await page.selectOption('#set-nmode', 'han');
  await showTab(page, 'play');
  await expect(page.locator('#play-moves')).toContainText('炮二平五');
  await showTab(page, 'about');
  await page.selectOption('#set-nmode', 'vi');
});

test('sao lưu ra JSON rồi khôi phục lại đúng dữ liệu', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const S = window.__xq.Store;
    S.set('tac_done', { t1: 1, t2: 1 });
    S.set('games', [{ id: 'g1', t: Date.now(), user: 1, level: 3, startFen: 'x', moves: ['h2e2', 'h9g7', 'h0g2', 'i9h9'], res: '' }]);
  });
  const backup = await page.evaluate(() => window.__xq.Backup.collect());
  expect(backup.app).toBe('co-tuong-luyen-tap');
  expect(JSON.parse(backup.data.tac_done)).toEqual({ t1: 1, t2: 1 });
  // xoá rồi khôi phục qua giao diện
  await page.evaluate(() => { window.__xq.Store.set('tac_done', {}); window.__xq.Store.set('games', []); });
  await showTab(page, 'about');
  await page.setInputFiles('#bk-file', { name: 'sao-luu.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#bk-confirm')).toBeVisible();
  await expect(page.locator('#bk-what')).toContainText('1 ván đã lưu');
  await Promise.all([page.waitForEvent('load'), page.click('#bk-apply')]);
  await page.waitForFunction(() => window.__xq && window.__xq.Store);
  expect(await page.evaluate(() => window.__xq.Store.get('tac_done', null))).toEqual({ t1: 1, t2: 1 });
  expect(await page.evaluate(() => window.__xq.Store.get('games', []).length)).toBe(1);
});

test('file không phải bản sao lưu thì bị từ chối', async ({ page }) => {
  await openApp(page);
  await showTab(page, 'about');
  await page.setInputFiles('#bk-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.locator('#toast')).toContainText('không phải bản sao lưu');
  await expect(page.locator('#bk-confirm')).toBeHidden();
});
