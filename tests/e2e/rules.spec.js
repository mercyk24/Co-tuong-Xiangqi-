// Luật lặp thế trong ván thật: nhắc ở lần lặp thứ hai, xử thua bên chiếu dai ở lần thứ ba.
'use strict';
const { test } = require('@playwright/test');
const { openApp, showTab, expect } = require('./helpers');

test('hai người: chiếu dai được tối đa 4 nước, nước thứ năm bị chặn, phải đi nước khác', async ({ page }) => {
  await openApp(page);
  await showTab(page, 'play');
  await page.click('.mode[data-m="pvp"]');
  await page.click('#pvp-times .btn[data-k="0"]');
  await page.evaluate(() => { const P = window.__xq.Play; P.startFen = '4k4/R8/9/9/9/9/9/9/9/3K5 w'; P.newGame(); });
  const play = list => page.evaluate(l => {
    const P = window.__xq.Play;
    for (const [a, b, c, d] of l) P.doMove((XQ.sq(a, b) << 7) | XQ.sq(c, d), true);
    return P.moves.length;
  }, list);
  // Đỏ chiếu 4 nước, Đen chạy Tướng
  expect(await play([[1, 0, 0, 0], [0, 4, 1, 4], [0, 0, 1, 0], [1, 4, 0, 4], [1, 0, 0, 0], [0, 4, 1, 4], [0, 0, 1, 0]])).toBe(7);
  await expect(page.locator('#toast')).toContainText('liên tục 4 nước');
  await expect(page.locator('#toast')).toContainText('Nước chiếu lặp lại tiếp theo sẽ không được đi');
  expect(await play([[1, 4, 0, 4]])).toBe(8);
  // nước chiếu thứ 5 lặp lại thế cũ: bị chặn
  expect(await play([[1, 0, 0, 0]])).toBe(8);
  await expect(page.locator('#toast')).toContainText('Bên Đỏ không được chiếu dai');
  // nước khác thì đi được, ván tiếp tục
  expect(await play([[1, 0, 2, 0]])).toBe(9);
  expect(await page.evaluate(() => window.__xq.Play.over)).toBeNull();
  await page.evaluate(() => { window.__xq.Play.startFen = XQ.START_FEN; });
});
