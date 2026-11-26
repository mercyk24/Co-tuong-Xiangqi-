// [DÙNG CHUNG] Trang chủ chọn loại cờ (src/portal/index.html): hai thẻ, đánh dấu loại cờ chơi gần nhất,
// link mời cũ của cờ tướng (#phong=…) chuyển sang /co-tuong/ và vào đúng phòng.
'use strict';
const { test } = require('@playwright/test');
const { expect } = require('../helpers');

test('trang chủ: chọn loại cờ, link mời cũ của cờ tướng vẫn vào đúng chỗ', async ({ page }) => {
  await page.goto('index.html');
  await expect(page.locator('a.game')).toHaveCount(2);
  await expect(page.locator('#g-xiangqi')).toHaveAttribute('href', 'co-tuong/');
  await expect(page.locator('#g-chess')).toHaveAttribute('href', 'co-vua/');
  await page.click('#g-chess');
  await page.waitForFunction(() => window.__xc && window.__xc.Play);
  await page.goto('index.html');
  await expect(page.locator('#g-chess')).toHaveClass(/last/);       // đánh dấu loại cờ chơi gần nhất
  await page.goto('about:blank');
  await page.goto('index.html#phong=ABC234');
  await page.waitForURL(/\/co-tuong\//);
  await page.waitForFunction(() => window.__xq && document.querySelector('#net-code').value === 'ABC234', null, { timeout: 20_000 });
});
