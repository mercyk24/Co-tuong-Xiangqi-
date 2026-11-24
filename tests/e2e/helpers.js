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

module.exports = { openApp, showTab, clickSquare, clickMove, expect };
