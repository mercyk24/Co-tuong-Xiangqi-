// Kiểm tra chơi qua mạng với điểm hẹn thật (0.peerjs.com) và máy chủ STUN thật.
// Cần Internet nên KHÔNG chạy mặc định (kể cả trên GitHub Actions). Chạy thủ công:
//   XQ_NET_REAL=1 npx playwright test net-real      (PowerShell: $env:XQ_NET_REAL=1; npx playwright test net-real)
'use strict';
const { test } = require('@playwright/test');
const { expect } = require('./helpers');

test.skip(!process.env.XQ_NET_REAL, 'Chỉ chạy khi đặt XQ_NET_REAL=1');
test.describe.configure({ timeout: 120_000 });

test('qua mạng thật: hai trình duyệt riêng nối qua 0.peerjs.com, đi quân đồng bộ', async ({ browser }) => {
  const errors = [];
  const open = async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.goto('index.html');
    await p.waitForFunction(() => window.crossOriginIsolated === true && window.__xq && window.__xq.Play, null, { timeout: 20_000 });
    return p;
  };
  const A = await open(), B = await open();
  const dump = async () => {
    for (const [name, p] of [['A (chủ phòng)', A], ['B (khách)', B]]) {
      console.log('--- Nhật ký ' + name + ' ---\n' + (await p.evaluate(() => window.__xq.Net.log.join('\n')).catch(e => String(e))));
    }
  };
  try {
    await A.evaluate(() => { window.__xq.Play.setMode('net'); return window.__xq.Net.create('0', '0'); });
    await A.waitForFunction(() => window.__xq.Net.state === 'waiting' || window.__xq.Net.state === 'error', null, { timeout: 30_000 });
    expect(await A.evaluate(() => window.__xq.Net.err)).toBe('');
    const code = await A.evaluate(() => window.__xq.Net.code);
    await B.evaluate(c => { window.__xq.Play.setMode('net'); return window.__xq.Net.join(c); }, code);
    await B.waitForFunction(() => window.__xq.Net.state === 'playing' || window.__xq.Net.state === 'error', null, { timeout: 45_000 });
    expect(await B.evaluate(() => window.__xq.Net.err)).toBe('');
    await A.waitForFunction(() => window.__xq.Net.state === 'playing');
    await A.evaluate(() => { const P = window.__xq.Play; P.doMove(P.ctx.pos.parse('炮二平五'), true); });
    await B.waitForFunction(() => window.__xq.Play.notes.length === 1, null, { timeout: 15_000 });
    await B.evaluate(() => { const P = window.__xq.Play; P.doMove(P.ctx.pos.parse('馬8進7'), true); });
    await A.waitForFunction(() => window.__xq.Play.notes.length === 2, null, { timeout: 15_000 });
  } finally {
    await dump();
  }
  // vào phòng với mã không tồn tại -> phải báo không tìm thấy (nhờ tin EXPIRE của điểm hẹn) hoặc quá giờ
  const C = await open();
  await C.evaluate(() => { window.__xq.Play.setMode('net'); return window.__xq.Net.join('ZZZZ99'); });
  await C.waitForFunction(() => window.__xq.Net.state === 'error', null, { timeout: 40_000 });
  console.log('Báo lỗi khi sai mã: ' + await C.evaluate(() => window.__xq.Net.err));
  expect(errors).toEqual([]);
});
