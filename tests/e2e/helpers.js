// Tiện ích dùng chung cho các bài kiểm tra giao diện.
'use strict';
const { expect } = require('@playwright/test');

// Mở app, chờ service worker bật chế độ cách ly (cần cho engine mạnh) và ghi lại mọi lỗi JavaScript.
async function openApp(page, { isolated = true } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('index.html');
  await page.waitForFunction(() => window.__xq && window.__xq.Play);
  if (isolated) {
    await page.waitForFunction(() => window.crossOriginIsolated === true, null, { timeout: 20_000 });
    await page.waitForFunction(() => window.__xq && window.__xq.Play);
  }
  return errors;
}

async function showTab(page, name) {
  // Khi đang đánh/giải bài, thanh điều hướng thu gọn: bấm vạch để mở lại trước.
  await page.waitForTimeout(100);
  if (await page.locator('#nav-handle').isVisible()) await page.click('#nav-handle');
  await page.locator('.tab[data-tab="' + name + '"]').click();
  await expect(page.locator('#v-' + name)).toBeVisible();
}

// Bấm vào một ô (0..89, hàng 0 là phía Đen) trên bàn cờ của tab tương ứng.
async function clickSquare(page, boardSel, obj, sq) {
  const pt = await page.evaluate(([sel, o, s]) => {
    const svg = document.querySelector(sel + ' svg'), r = svg.getBoundingClientRect(), b = window.__xq[o].board;
    return { x: r.left + b.X(s % 9) * r.width / b.W, y: r.top + b.Y((s / 9) | 0) * r.height / b.H };
  }, [boardSel, obj, sq]);
  await page.mouse.click(pt.x, pt.y);
}

// Đi một nước bằng cách bấm quân rồi bấm ô đích (nước ở dạng số nguyên của lõi: from<<7 | to).
async function clickMove(page, boardSel, obj, m) {
  await clickSquare(page, boardSel, obj, m >> 7);
  await clickSquare(page, boardSel, obj, m & 127);
}

// Đấu với máy: mở "Tùy chọn ván", chọn cấp độ / nước mở đầu / bên cầm rồi bắt đầu ván mới.
async function aiNewGame(page, { side, level, open } = {}) {
  await page.locator('#pbar-bot [data-act="menu"]').click();
  await expect(page.locator('#am')).toBeVisible();
  if (level !== undefined) await page.selectOption('#play-level', String(level));
  if (open !== undefined) await page.selectOption('#play-open', open);
  if (side !== undefined) await page.selectOption('#play-side', String(side));
  await page.click('#play-new');
  await expect(page.locator('#am-back')).toBeHidden();
}
// Mở "Tùy chọn ván" rồi bấm một nút trong đó.
async function aiMenu(page, id) {
  await page.locator('#pbar-bot [data-act="menu"]').click();
  await page.click(id);
}

module.exports = { openApp, showTab, clickSquare, clickMove, aiNewGame, aiMenu, expect };
