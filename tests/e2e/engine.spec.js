// Kiểm tra engine mạnh (Fairy-Stockfish WebAssembly): cấp 6, phân tích ván, soi sâu, "Lỗi của bạn".
// Các bài này chậm hơn (tải 13 MB engine và cho engine nghĩ), nên được giới hạn 3 phút mỗi bài.
'use strict';
const { test } = require('@playwright/test');
const { openApp, showTab, aiNewGame, expect } = require('./helpers');

test.describe.configure({ timeout: 180_000 });

test('cấp 6 (Cao thủ) dùng engine mạnh và đi nước hợp lệ', async ({ page }) => {
  const errors = await openApp(page);
  await aiNewGame(page, { side: 1, level: 6, open: '' });
  await page.waitForFunction(() => window.__xq.Play.notes.length === 1);
  // Một nước lạ (Tốt biên) để ra khỏi sách khai cuộc, buộc máy phải dùng engine mạnh.
  await page.evaluate(() => { const P = window.__xq.Play; P.doMove(P.ctx.pos.parse('卒1進1'), true); });
  expect(await page.evaluate(() => { const P = window.__xq.Play; return P.bookMove(); })).toBe(0);
  await page.waitForFunction(() => window.__xq.Play.notes.length === 3 && !window.__xq.Play.thinking, null, { timeout: 90_000 });
  expect(await page.evaluate(() => !!window.__xq.FSF.sf)).toBe(true);
  await expect(page.locator('#toast')).not.toContainText('Tạm dùng cấp 5');
  expect(errors).toEqual([]);
});

test('phân tích ván: phát hiện nước bỏ Pháo, đưa vào "Lỗi của bạn", soi sâu hiện đường đi', async ({ page }) => {
  await openApp(page);
  // Đỏ (người chơi) đi Pháo đầu rồi Pháo ăn Tốt giữa, bị Mã ăn mất Pháo: một sai lầm rõ ràng ở nước thứ 3.
  await page.evaluate(() => {
    const A = window.__xq.Ana;
    A.games.unshift({ id: 'gtest', t: Date.now(), user: 0, level: 3, startFen: XQ.START_FEN, moves: ['h2e2', 'h9g7', 'e2e6', 'g7e6', 'h0g2', 'i9h9'], res: '(thử)' });
    window.__xq.Store.set('games', A.games);
    window.__xq.Store.set('ana_mode', 'fast');
    window.__xq.Store.set('mine', []);
  });
  await page.evaluate(() => { window.__xq.showTab('ana'); window.__xq.Ana.open('gtest'); });
  await expect(page.locator('#v-ana')).toBeVisible();
  await page.waitForFunction(() => window.__xq.Ana.cur && window.__xq.Ana.cur.ana, null, { timeout: 120_000 });
  const ana = await page.evaluate(() => window.__xq.Ana.cur.ana);
  expect(ana.ls[2]).toBeGreaterThanOrEqual(270);
  expect(await page.evaluate(() => window.__xq.Ana.k)).toBe(2);
  await expect(page.locator('#ana-info')).toContainText(/Sai lầm/);
  await expect(page.locator('#ana-info')).toContainText('Engine dự kiến');
  expect(await page.evaluate(() => window.__xq.Store.get('mine', []).length)).toBeGreaterThanOrEqual(1);
  // dữ liệu thật (ván đã phân tích, "Lỗi của bạn") phải qua được bộ lọc khi khôi phục từ tệp sao lưu
  expect(await page.evaluate(() => !!window.__xq.Backup.clean(window.__xq.Backup.collect()))).toBe(true);
  // soi sâu vài giây rồi dừng
  await page.click('#ana-deep');
  await expect(page.locator('#ana-live')).toContainText('độ sâu', { timeout: 20_000 });
  await page.click('#ana-deep');
  await expect(page.locator('#ana-deep')).toHaveText('Soi sâu thế này');
  // bài "Lỗi của bạn" mở được và giải được
  await showTab(page, 'tac');
  await page.click('#tac-mine-go');
  await expect(page.locator('#tac-title')).toContainText('Lỗi của bạn');
  await page.evaluate(() => { const T = window.__xq.Tac; T.attempt(T.ctx.pos.legalMoves().find(x => XQ.mvStr(x) === T.cur.best)); });
  await page.waitForFunction(() => window.__xq.Tac.solved);
});

test('phân tích ván hai người: nhận xét cả hai bên', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const A = window.__xq.Ana;
    A.games.unshift({ id: 'gpvp', t: Date.now(), user: 0, pvp: true, level: 0, startFen: XQ.START_FEN, moves: ['h2e2', 'h9g7', 'e2e6', 'g7e6', 'h0g2', 'e6d4'], res: '(thử)' });
    window.__xq.Store.set('games', A.games);
    window.__xq.Store.set('ana_mode', 'fast');
    window.__xq.showTab('ana'); A.open('gpvp');
  });
  await page.waitForFunction(() => window.__xq.Ana.cur && window.__xq.Ana.cur.ana, null, { timeout: 120_000 });
  await expect(page.locator('#ana-title')).toContainText('Hai người chơi');
  await expect(page.locator('#ana-sum')).toContainText('Đỏ đi 3 nước');
  await expect(page.locator('#ana-sum')).toContainText('Đen đi 3 nước');
  await expect(page.locator('#ana-list-wrap')).toBeHidden();
});
