// [CỜ VÂY] Chơi qua mạng với điểm hẹn riêng (server/dev-server.mjs): người xem nhận đúng cỡ bàn của phòng; tải lại trang giữa ván
// thì nối lại đúng bàn 19×19 (thế bắt đầu được lưu cùng phiên và gửi kèm tin 'state' / 'snap').
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { test } = require('@playwright/test');
const { expect } = require('../helpers');

test.describe.configure({ timeout: 120_000 });

let S1;
const contexts = [];
test.afterEach(async () => { for (const c of contexts.splice(0)) await c.close(); });
test.beforeAll(async () => {
  const { startServer } = await import(pathToFileURL(path.join(__dirname, '..', '..', '..', 'server', 'dev-server.mjs')).href);
  S1 = await startServer(4183);
});
test.afterAll(async () => { if (S1) await S1.close(); });

// Mỗi máy một context riêng (localStorage riêng), như ba điện thoại thật: phiên chơi lưu trên máy này không lẫn sang máy khác
async function device(browser, errors) {
  const context = await browser.newContext();
  contexts.push(context);
  const p = await context.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => {
    localStorage.setItem('xv_consent_net', '{"v":"2026-11-25","t":1}');
    window.__XQ_SIGNAL__ = ['ws://127.0.0.1:4183']; window.__XQ_ICE__ = []; window.__XQ_JOIN_MS__ = 20000;
  });
  await p.goto('co-vay/index.html');
  await p.waitForFunction(() => window.crossOriginIsolated === true && window.__xv && window.__xv.Play, null, { timeout: 20_000 });
  return p;
}
const move = (p, s) => p.evaluate(x => { const P = window.__xv.Play; P.doMove(P.ctx.pos.parse(x), true); }, s);

test('cờ vây qua mạng: người xem thấy đúng bàn 19×19; khách tải lại trang giữa ván thì nối lại đúng bàn', async ({ browser }) => {
  const errors = [];
  const A = await device(browser, errors);
  await A.evaluate(() => { window.__xv.Store.set('go_size', 19); window.__xv.Play.setMode('net'); return window.__xv.Net.create('0', '0'); });
  await A.waitForFunction(() => window.__xv.Net.state === 'waiting', null, { timeout: 20_000 });
  const code = await A.evaluate(() => window.__xv.Net.code);
  expect(await A.evaluate(() => window.__xv.Net.myId)).toBe('xgvn-' + code.toLowerCase());
  const B = await device(browser, errors);
  await B.evaluate(c => { window.__xv.Store.set('go_size', 9); window.__xv.Play.setMode('net'); return window.__xv.Net.join(c); }, code);
  await B.waitForFunction(() => window.__xv.Net.state === 'playing', null, { timeout: 40_000 });
  await A.waitForFunction(() => window.__xv.Net.state === 'playing', null, { timeout: 10_000 });
  expect(await B.evaluate(() => window.__xv.Play.ctx.pos.n)).toBe(19);
  await move(A, 'Q16'); await B.waitForFunction(() => window.__xv.Play.notes.length === 1);
  await move(B, 'D4'); await A.waitForFunction(() => window.__xv.Play.notes.length === 2);
  // Người xem
  const C = await device(browser, errors);
  await C.evaluate(c => { window.__xv.Play.setMode('net'); return window.__xv.Net.join(c); }, code);
  await expect(C.locator('#net-watch-ask')).toBeVisible();
  await C.click('#net-watch-yes');
  await C.waitForFunction(() => window.__xv.Net.state === 'watching' && window.__xv.Play.notes.length === 2, null, { timeout: 15_000 });
  expect(await C.evaluate(() => [window.__xv.Play.ctx.pos.n, window.__xv.Play.notes.join(' ')])).toEqual([19, 'Q16 D4']);
  await expect(C.locator('#go-pass')).toBeHidden();
  // Khách tải lại trang: vào lại ván đang dở, vẫn là bàn 19×19 với đủ nước
  await B.reload();
  await B.waitForFunction(() => window.__xv && window.__xv.Net.state === 'playing' && window.__xv.Play.notes.length === 2, null, { timeout: 40_000 });
  expect(await B.evaluate(() => window.__xv.Play.ctx.pos.n)).toBe(19);
  await move(A, 'Q4'); await B.waitForFunction(() => window.__xv.Play.notes.length === 3);
  await C.waitForFunction(() => window.__xv.Play.notes.length === 3);
  expect(errors).toEqual([]);
});

test('cờ vây qua mạng: hai bên bỏ lượt thì máy chủ phòng đếm điểm, khách và người xem nhận cùng kết quả', async ({ browser }) => {
  const errors = [];
  const A = await device(browser, errors);
  await A.evaluate(() => { window.__xv.Store.set('go_size', 9); window.__xv.Play.setMode('net'); return window.__xv.Net.create('0', '0'); });
  await A.waitForFunction(() => window.__xv.Net.state === 'waiting', null, { timeout: 20_000 });
  const code = await A.evaluate(() => window.__xv.Net.code);
  const B = await device(browser, errors);
  await B.evaluate(c => { window.__xv.Play.setMode('net'); return window.__xv.Net.join(c); }, code);
  await B.waitForFunction(() => window.__xv.Net.state === 'playing', null, { timeout: 40_000 });
  await A.waitForFunction(() => window.__xv.Net.state === 'playing', null, { timeout: 10_000 });
  const seq = ['E5', 'C3', 'D7', 'G3'];
  for (let i = 0; i < seq.length; i++) {
    const P = i % 2 ? B : A, Q = i % 2 ? A : B;
    await move(P, seq[i]); await Q.waitForFunction(k => window.__xv.Play.notes.length === k, i + 1);
  }
  const C = await device(browser, errors);
  await C.evaluate(c => { window.__xv.Play.setMode('net'); return window.__xv.Net.join(c); }, code);
  await expect(C.locator('#net-watch-ask')).toBeVisible();
  await C.click('#net-watch-yes');
  await C.waitForFunction(() => window.__xv.Net.state === 'watching' && window.__xv.Play.notes.length === 4, null, { timeout: 15_000 });
  await A.click('#go-pass'); await B.waitForFunction(() => window.__xv.Play.notes.length === 5);
  // Khách không có nút Xác nhận / Chơi tiếp; bỏ lượt lần hai thì chờ chủ phòng
  await B.click('#go-pass');
  await expect(A.locator('#play-result')).toBeVisible({ timeout: 30_000 });
  await expect(B.locator('#play-result')).toBeVisible({ timeout: 30_000 });
  const ta = await A.evaluate(() => window.__xv.Play.over), tb = await B.evaluate(() => window.__xv.Play.over);
  expect(ta).toContain('chủ phòng ước lượng');
  expect(tb).toBe(ta);
  expect(await B.evaluate(() => window.__xv.Play.final && window.__xv.Play.final.dead.size)).toBe(await A.evaluate(() => window.__xv.Play.final.dead.size));
  await C.waitForFunction(t => window.__xv.Play.over === t, ta, { timeout: 15_000 });
  expect(errors).toEqual([]);
});
