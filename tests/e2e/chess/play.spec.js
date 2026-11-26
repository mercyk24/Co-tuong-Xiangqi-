// CỜ VUA (/co-vua/): luật trên bàn cờ thật, đấu máy, hai người, phong cấp, kết thúc ván,
// chơi qua mạng, tách dữ liệu với cờ tướng.
'use strict';
const { test } = require('@playwright/test');
const { expect } = require('../helpers');

test.describe.configure({ timeout: 90_000 });

async function openChess(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('co-vua/index.html');
  await page.waitForFunction(() => window.__xc && window.__xc.Play);
  await page.waitForFunction(() => window.crossOriginIsolated === true, null, { timeout: 20_000 });
  await page.waitForFunction(() => window.__xc && window.__xc.Play);
  return errors;
}
// Bấm vào ô (tên ô dạng 'e2') trên bàn cờ của tab Trang chủ
async function tap(page, name) {
  const pt = await page.evaluate(n => {
    const P = window.__xc.Play, b = P.board, s = CH.sqParse(n), svg = document.querySelector('#play-board svg'), r = svg.getBoundingClientRect();
    return { x: r.left + (b.X(CH.COL(s)) + b.cell / 2) * r.width / b.W, y: r.top + (b.Y(CH.ROW(s)) + b.cell / 2) * r.height / b.H };
  }, name);
  await page.mouse.click(pt.x, pt.y);
}
const play = (page, list) => page.evaluate(l => { const P = window.__xc.Play; for (const u of l) P.doMove(P.ctx.pos.parse(u), true); return P.moves.length; }, list);
async function pvp(page, fen) {
  await page.click('.mode[data-m="pvp"]');
  await page.click('#pvp-times .btn[data-k="0"]');
  if (fen) await page.evaluate(f => { const P = window.__xc.Play; P.startFen = f; P.newGame(); }, fen);
}

test('cờ vua: đấu máy, đi bằng cách bấm ô, máy đáp nước hợp lệ; dữ liệu lưu riêng (xc_), không đụng cờ tướng', async ({ page }) => {
  const errors = await openChess(page);
  await expect(page.locator('.hero h1')).toHaveText('Cờ Vua');
  await page.click('.mode[data-m="ai"]');
  await page.click('#ai-side .chip[data-v="0"]');
  await page.click('#ai-levels .lvl[data-v="2"]');
  await page.click('#ai-start');
  await tap(page, 'e2'); await tap(page, 'e4');
  await page.waitForFunction(() => window.__xc.Play.moves.length >= 2, null, { timeout: 20_000 });
  const st = await page.evaluate(() => ({ notes: window.__xc.Play.notes.slice(), fen: window.__xc.Play.ctx.pos.fen() }));
  expect(st.notes[0]).toBe('e4');
  expect(st.fen.split(' ')[1]).toBe('w');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some(k => k.indexOf('xc_') === 0)).toBe(true);
  expect(keys.filter(k => k.indexOf('xq_') === 0)).toEqual([]);
  expect(errors).toEqual([]);
});

test('cờ vua: nhập thành và bắt tốt qua đường bằng cách bấm ô', async ({ page }) => {
  await openChess(page);
  await pvp(page);
  await play(page, ['e2e4', 'a7a6', 'g1f3', 'a6a5', 'f1c4', 'a5a4', 'e4e5', 'd7d5']);
  await tap(page, 'e5'); await tap(page, 'd6');                      // bắt tốt qua đường
  let s = await page.evaluate(() => ({ n: window.__xc.Play.notes.slice(-1)[0], d5: window.__xc.Play.ctx.pos.b[CH.sqParse('d5')] }));
  expect(s).toEqual({ n: 'exd6', d5: 0 });
  await play(page, ['b7b6']);
  await tap(page, 'e1'); await tap(page, 'g1');                      // nhập thành cánh Vua
  s = await page.evaluate(() => { const b = window.__xc.Play.ctx.pos.b; return { n: window.__xc.Play.notes.slice(-1)[0], f1: b[CH.sqParse('f1')], g1: b[CH.sqParse('g1')] }; });
  expect(s).toEqual({ n: 'O-O', f1: 4, g1: 6 });
});

test('cờ vua: phong cấp hỏi chọn quân, chọn Mã thì ra Mã; "Luôn phong Hậu" thì không hỏi', async ({ page }) => {
  await openChess(page);
  await pvp(page, '8/4P1k1/8/8/8/8/8/4K3 w - - 0 1');
  await tap(page, 'e7'); await tap(page, 'e8');
  await expect(page.locator('#promo')).toBeVisible();
  await page.click('#promo [data-t="2"]');
  await expect(page.locator('#promo')).toBeHidden();
  expect(await page.evaluate(() => ({ n: window.__xc.Play.notes[0], p: window.__xc.Play.ctx.pos.b[CH.sqParse('e8')] }))).toEqual({ n: 'e8=N+', p: 2 });
  // bật Luôn phong Hậu
  await page.evaluate(() => window.__xc.Store.set('autoq', true));
  await page.evaluate(() => { const P = window.__xc.Play; P.startFen = '8/4P1k1/8/8/8/8/8/4K3 w - - 0 1'; P.newGame(); });
  await tap(page, 'e7'); await tap(page, 'e8');
  await expect(page.locator('#promo')).toBeHidden();
  expect(await page.evaluate(() => window.__xc.Play.notes[0])).toBe('e8=Q');
  await page.evaluate(() => { window.__xc.Store.set('autoq', false); window.__xc.Play.startFen = CH.START_FEN; });
});

test('cờ vua: chiếu hết, hết nước đi (pat), lặp ba lần, không đủ quân đều kết thúc đúng', async ({ page }) => {
  await openChess(page);
  await pvp(page);
  await play(page, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);                     // chiếu hết nhanh nhất
  expect(await page.evaluate(() => window.__xc.Play.over)).toBe('Đen thắng – chiếu hết.');
  await expect(page.locator('#play-result')).toBeVisible();
  await page.evaluate(() => { const P = window.__xc.Play; P.startFen = '7k/8/5Q2/8/8/8/8/6K1 w - - 0 1'; P.newGame(); });
  await play(page, ['f6g6']);                                             // Hậu g6: Vua h8 hết nước đi, không bị chiếu
  expect(await page.evaluate(() => window.__xc.Play.over)).toBe('Hòa – hết nước đi (pat).');
  await page.evaluate(() => { const P = window.__xc.Play; P.startFen = CH.START_FEN; P.newGame(); });
  await play(page, ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
  expect(await page.evaluate(() => window.__xc.Play.over)).toBe('Hòa – thế cờ lặp lại ba lần.');
  await page.evaluate(() => { const P = window.__xc.Play; P.startFen = '8/8/4k3/8/8/4K3/3n4/2B5 w - - 0 1'; P.newGame(); });
  await play(page, ['c1d2']);                                             // Tượng ăn Mã: chỉ còn Vua và Tượng
  expect(await page.evaluate(() => window.__xc.Play.over)).toBe('Hòa – không đủ quân để chiếu hết.');
  await page.evaluate(() => { window.__xc.Play.startFen = CH.START_FEN; });
});

test('cờ vua: tệp sao lưu của cờ tướng không khôi phục được vào cờ vua', async ({ page }) => {
  await openChess(page);
  const xq = { app: 'co-tuong-luyen-tap', version: '1.8.0', exportedAt: new Date().toISOString(), data: { tac_done: '{"t1":1}' } };
  expect(await page.evaluate(o => window.__xc.Backup.clean(o), xq)).toBeNull();
  const own = await page.evaluate(() => window.__xc.Backup.collect());
  expect(own.app).toBe('co-vua-luyen-tap');
  expect(await page.evaluate(o => !!window.__xc.Backup.clean(o), own)).toBe(true);
});

test('cờ vua qua mạng: tạo phòng, vào phòng, đi nước hai chiều; mã máy dùng tiền tố xcvn-', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { localStorage.setItem('xc_consent_net', '{"v":"2026-11-25","t":1}'); window.__XQ_SIGNAL__ = 'local'; window.__XQ_ICE__ = []; });
  const A = await ctx.newPage(); await A.goto('co-vua/index.html');
  await A.waitForFunction(() => window.crossOriginIsolated === true && window.__xc && window.__xc.Play, null, { timeout: 20_000 });
  await A.click('.mode[data-m="net"]');
  await A.click('#net-go-create');
  await A.selectOption('#net-side', '0');
  await A.locator('#net-times .btn[data-k="0"]').click();
  await expect(A.locator('#net-code-show')).toHaveText(/^[A-Z2-9]{6}$/);
  const code = await A.locator('#net-code-show').innerText();
  expect(await A.evaluate(() => window.__xc.Net.myId)).toMatch(/^xcvn-/);
  const B = await ctx.newPage(); await B.goto('co-vua/index.html');
  await B.waitForFunction(() => window.crossOriginIsolated === true && window.__xc && window.__xc.Play, null, { timeout: 20_000 });
  await B.evaluate(() => window.__xc.Play.setMode('net'));
  await B.fill('#net-code', code); await B.click('#net-join');
  await A.waitForFunction(() => window.__xc.Net.state === 'playing', null, { timeout: 30_000 });
  await B.waitForFunction(() => window.__xc.Net.state === 'playing', null, { timeout: 30_000 });
  await A.evaluate(() => { const P = window.__xc.Play; P.doMove(P.ctx.pos.parse('e2e4'), true); });
  await B.waitForFunction(() => window.__xc.Play.moves.length === 1);
  await B.evaluate(() => { const P = window.__xc.Play; P.doMove(P.ctx.pos.parse('c7c5'), true); });
  await A.waitForFunction(() => window.__xc.Play.moves.length === 2);
  expect(await A.evaluate(() => window.__xc.Play.notes)).toEqual(['e4', 'c5']);
  expect(await B.evaluate(() => window.__xc.Play.board.flip)).toBe(true);     // người cầm Đen nhìn từ phía Đen
  await ctx.close();
});
