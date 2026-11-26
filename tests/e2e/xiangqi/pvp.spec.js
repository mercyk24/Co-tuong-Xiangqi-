// Kiểm tra chế độ hai người chơi trên một máy (luôn ngồi đối mặt: Đỏ dưới, Đen trên).
'use strict';
const { test } = require('@playwright/test');
const { openApp, clickMove, aiNewGame, expect } = require('../helpers');

const P = page => page.evaluate(() => {
  const p = window.__xq.Play;
  return { n: p.notes.length, notes: p.notes.slice(), side: p.ctx.pos.side, flip: p.board.flip, over: p.over };
});
const mv = (page, s) => page.evaluate(x => window.__xq.Play.ctx.pos.parse(x), s);
const play = (page, list) => page.evaluate(l => { const p = window.__xq.Play; for (const s of l) p.doMove(p.ctx.pos.parse(s), true); }, list);
const bar = (page, pos) => page.locator('#pbar-' + pos);
// Một bên mở menu ☰ ở phía mình rồi bấm việc (undo / draw / resign).
async function act(page, pos, a) {
  await bar(page, pos).locator('[data-act="menu"]').click();
  await page.locator('#pm [data-act="' + a + '"]').click();
}
// Ở trang chủ bấm "Hai người một máy", chọn thời gian (mặc định không tính giờ) để vào ván.
async function pvp(page, time = '0') {
  await page.locator('.mode[data-m="pvp"]').click();
  await expect(page.locator('#pvp-setup')).toBeVisible();
  await expect(bar(page, 'bot')).toBeHidden();
  await page.locator('#pvp-times .btn[data-k="' + time + '"]').click();
  await expect(page.locator('#pvp-setup')).toBeHidden();
  await expect(bar(page, 'bot')).toBeVisible();
}
const TEN = ['炮二平五', '馬8進7', '傌二進三', '車9平8', '車一平二', '卒7進1', '車二進六', '馬2進3', '兵七進一', '炮8平9'];

test('hai người: chọn thời gian rồi vào ván; luôn đối mặt, Đỏ dưới, quân Đen quay ngược; máy không tự đi', async ({ page }) => {
  const errors = await openApp(page);
  await pvp(page);
  await expect(page.locator('#play-title')).toHaveText('Hai người một máy');
  await expect(page.locator('#play-home')).toBeHidden();
  await expect(page.locator('#am-back')).toBeHidden();
  await expect(page.locator('#play-mode')).toBeHidden();
  await expect(page.locator('#play-orient')).toHaveCount(0);
  const rot = await page.evaluate(() => ({
    black: document.querySelectorAll('#play-board g.pc.b[transform*="rotate(180)"]').length,
    red: document.querySelectorAll('#play-board g.pc.r[transform*="rotate(180)"]').length
  }));
  expect(rot).toEqual({ black: 16, red: 0 });
  await expect(bar(page, 'top')).toHaveClass(/rot/);
  await expect(bar(page, 'bot').locator('.pname')).toHaveText('Đỏ');
  await expect(bar(page, 'bot').locator('.pst')).toHaveText('Đến lượt');
  await clickMove(page, '#play-board', 'Play', await mv(page, '炮二平五'));
  await clickMove(page, '#play-board', 'Play', await mv(page, '馬8進7'));
  await page.waitForTimeout(800);
  const s = await P(page);
  expect(s.notes).toEqual(['炮二平五', '馬8進7']);
  expect(s.flip).toBe(false);
  await expect(bar(page, 'top').locator('.pst')).toHaveText('Chờ đối thủ');
  expect(errors).toEqual([]);
});

test('hai người: chọn thời gian thì đồng hồ của Đỏ chạy ngay khi vào ván, hết giờ thì thua', async ({ page }) => {
  await openApp(page);
  await pvp(page, '3+2');
  await page.waitForTimeout(1500);
  const left = await page.evaluate(() => window.__xq.Play.clock.left.slice());
  expect(left[0]).toBeLessThan(179000);
  expect(left[1]).toBe(180000);
  await expect(bar(page, 'bot')).toHaveClass(/on/);
  await play(page, ['炮二平五']);
  const after = await page.evaluate(() => window.__xq.Play.clock.left.slice());
  expect(after[0]).toBeGreaterThan(left[0]); // được cộng 2 giây sau nước đi
  await expect(bar(page, 'top')).toHaveClass(/on/);
  await page.evaluate(() => { window.__xq.Play.clock.left[1] = 300; });
  await page.waitForFunction(() => !!window.__xq.Play.over);
  expect((await P(page)).over).toBe('Đen hết giờ – Đỏ thắng.');
});

test('hai người: xin đi lại cần bên kia đồng ý, câu hỏi hiện ở phía người trả lời', async ({ page }) => {
  await openApp(page);
  await pvp(page);
  await play(page, ['炮二平五', '馬8進7']);
  await act(page, 'bot', 'undo');
  await expect(page.locator('#ask-top #play-ask')).toBeVisible();
  await expect(page.locator('#play-ask')).toHaveClass(/rot/);
  await expect(page.locator('#play-ask-text')).toHaveText('Đỏ xin đi lại nước vừa rồi. Đen có đồng ý không?');
  await page.click('#play-ask-no');
  expect((await P(page)).n).toBe(2);
  await act(page, 'bot', 'undo');
  await page.click('#play-ask-yes');
  expect((await P(page)).n).toBe(0);
  await play(page, ['炮二平五', '馬8進7']);
  await act(page, 'top', 'undo');
  await expect(page.locator('#ask-bot #play-ask')).toBeVisible();
  await page.click('#play-ask-yes');
  expect((await P(page)).notes).toEqual(['炮二平五']);
});

test('hai người: xin hòa, chịu thua; ván ngắn không có phân tích, đủ 5 nước mỗi bên thì có', async ({ page }) => {
  await openApp(page);
  await pvp(page);
  await play(page, ['炮二平五', '馬8進7', '傌二進三']);
  await act(page, 'bot', 'draw');
  await expect(page.locator('#play-ask-text')).toHaveText('Đỏ xin hòa. Đen có đồng ý không?');
  await page.click('#play-ask-yes');
  expect((await P(page)).over).toBe('Hòa – hai bên đồng ý.');
  await expect(page.locator('#play-result-ana')).toBeHidden();
  await expect(page.locator('#play-result-note')).toContainText('dưới 5 nước mỗi bên');
  // "Ván mới" ở thẻ kết quả mở lại màn chọn thời gian
  await page.click('#play-result-new');
  await expect(page.locator('#pvp-setup')).toBeVisible();
  await page.locator('#pvp-times .btn[data-k="0"]').click();
  await play(page, TEN);
  await act(page, 'top', 'resign');
  await expect(page.locator('#ask-top #play-ask')).toBeVisible();
  await page.click('#play-ask-yes');
  expect((await P(page)).over).toBe('Đen chịu thua – Đỏ thắng.');
  await expect(bar(page, 'bot').locator('.pst')).toHaveText('Thắng');
  await expect(bar(page, 'top').locator('.pst')).toHaveText('Thua');
  await page.click('#play-result-ana');
  await expect(page.locator('#v-ana')).toBeVisible();
});

test('menu khi đang đánh: phía Đen quay ngược; không có Ván mới hay Đấu với máy', async ({ page }) => {
  await openApp(page);
  await pvp(page);
  await bar(page, 'top').locator('[data-act="menu"]').click();
  await expect(page.locator('#pm')).toHaveClass(/rot/);
  await expect(page.locator('#pm-title')).toHaveText('Menu · bên Đen');
  await expect(page.locator('#pm')).not.toContainText('Ván mới');
  await expect(page.locator('#pm')).not.toContainText('Đấu với máy');
  await page.click('#pm-close');
  await expect(page.locator('#play-result')).toBeHidden();
});

test('bàn cờ hai người nằm giữa màn hình, thanh điều hướng thu gọn khi đang đánh và mở lại được', async ({ page }) => {
  await openApp(page);
  await pvp(page);
  await expect(page.locator('.tab[data-tab="puz"]')).toBeHidden();
  await expect(page.locator('#nav-handle')).toBeVisible();
  const box = await page.locator('#play-board').boundingBox();
  const vh = page.viewportSize().height;
  const mid = box.y + box.height / 2;
  expect(Math.abs(mid - (vh - 36) / 2)).toBeLessThan(60);
  await page.click('#nav-handle');
  await expect(page.locator('.tab[data-tab="puz"]')).toBeVisible();
  await page.waitForTimeout(6000);
  await expect(page.locator('.tab[data-tab="puz"]')).toBeVisible(); // không tự thu lại theo thời gian
  await page.mouse.click(20, 20); // bấm ra ngoài thanh
  await expect(page.locator('.tab[data-tab="puz"]')).toBeHidden();
  await expect(page.locator('#nav-handle')).toBeVisible();
});

test('ván xong: thẻ kết quả có Ván mới (chọn lại thời gian) và Trang chủ; thanh điều hướng hiện lại', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#play-home')).toBeVisible();
  await expect(page.locator('#play-board')).toBeHidden();
  await page.locator('.mode[data-m="pvp"]').click();
  await expect(page.locator('#play-board')).toBeHidden();    // màn chọn thời gian không có bàn cờ
  await page.click('#play-back');
  await expect(page.locator('#play-mode')).toBeVisible();
  await pvp(page);
  await play(page, ['炮二平五']);
  await act(page, 'bot', 'resign');
  await page.click('#play-ask-yes');
  await expect(page.locator('.tab[data-tab="puz"]')).toBeVisible();
  await page.click('#play-result-new');
  await expect(page.locator('#pvp-setup')).toBeVisible();
  await page.locator('#pvp-times .btn[data-k="0"]').click();
  await play(page, ['炮二平五']);
  await act(page, 'top', 'resign');
  await page.click('#play-ask-yes');
  await expect(page.locator('#play-result-mode')).toHaveText('Trang chủ');
  await page.click('#play-result-mode');
  await expect(page.locator('#play-mode')).toBeVisible();
  await aiNewGame(page, { side: 1, level: 2 });
  await page.waitForFunction(() => window.__xq.Play.notes.length === 1);
  await expect(page.locator('#play-title')).toHaveText('Đấu với máy');
});

test('trang chủ: về trang chủ giữa ván thì giữ ván (đồng hồ dừng), Tiếp tục để chơi tiếp, Bỏ ván để chọn chế độ khác', async ({ page }) => {
  const errors = await openApp(page);
  await pvp(page, '5+0');
  await play(page, ['炮二平五', '馬8進7']);
  await bar(page, 'bot').locator('[data-act="menu"]').click();
  await page.click('#pm-home');
  await expect(page.locator('#play-home')).toBeVisible();
  await expect(page.locator('#play-board')).toBeHidden();
  await expect(page.locator('#home-resume-title')).toHaveText('Ván hai người đang dở');
  await expect(page.locator('#home-resume-sub')).toContainText('đồng hồ đang dừng');
  const left = await page.evaluate(() => window.__xq.Play.clock.left.slice());
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__xq.Play.clock.left.slice())).toEqual(left);
  // Đang có ván dở thì chưa chọn được chế độ khác
  await page.locator('.mode[data-m="ai"]').click();
  await expect(page.locator('#toast')).toContainText('Tiếp tục');
  await expect(page.locator('#play-home')).toBeVisible();
  await page.click('#home-resume-go');
  await expect(page.locator('#play-board')).toBeVisible();
  expect((await P(page)).n).toBe(2);
  await play(page, ['傌二進三']);
  expect((await P(page)).n).toBe(3);
  // Bấm tab Trang chủ cũng về trang chủ; Bỏ ván thì hết thẻ ván dở
  await page.click('#nav-handle');
  await page.locator('.tab[data-tab="play"]').click();
  await expect(page.locator('#home-resume')).toBeVisible();
  await page.click('#home-resume-drop');
  await expect(page.locator('#home-resume')).toBeHidden();
  await page.locator('.mode[data-m="ai"]').click();
  await expect(page.locator('#ai-setup')).toBeVisible();
  expect(errors).toEqual([]);
});
