// Kiểm tra chơi qua mạng với điểm hẹn thật và máy chủ STUN thật:
//   - danh sách điểm hẹn mặc định của app (điểm hẹn riêng trên Cloudflare trước, 0.peerjs.com dự phòng)
//   - chỉ điểm hẹn công cộng 0.peerjs.com (để chắc phần dự phòng vẫn chạy)
// Cần Internet nên KHÔNG chạy mặc định (kể cả trên GitHub Actions). Chạy thủ công:
//   XQ_NET_REAL=1 npx playwright test net-real      (PowerShell: $env:XQ_NET_REAL=1; npx playwright test net-real)
'use strict';
const { test } = require('@playwright/test');
const { expect } = require('./helpers');

test.skip(!process.env.XQ_NET_REAL, 'Chỉ chạy khi đặt XQ_NET_REAL=1');
test.describe.configure({ timeout: 120_000 });

async function run(browser, signal) {
  const errors = [];
  const open = async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    if (signal) await p.addInitScript(s => { window.__XQ_SIGNAL__ = s; }, signal);
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
    const where = await B.evaluate(() => window.__xq.Net.log.filter(l => l.includes('đã vào điểm hẹn')).join(' | '));
    console.log('Điểm hẹn đã dùng (' + (signal || 'mặc định') + '): ' + where);
    if (!signal) expect(where).toContain('workers.dev');
    else expect(where).toContain('0.peerjs.com');
  } finally {
    await dump();
  }
  // vào phòng với mã không tồn tại -> phải báo không tìm thấy (nhờ tin EXPIRE của điểm hẹn) hoặc quá giờ
  const C = await open();
  await C.evaluate(() => { window.__xq.Play.setMode('net'); return window.__xq.Net.join('ZZZZ99'); });
  await C.waitForFunction(() => window.__xq.Net.state === 'error', null, { timeout: 40_000 });
  console.log('Báo lỗi khi sai mã: ' + await C.evaluate(() => window.__xq.Net.err));
  expect(errors).toEqual([]);
}

test('qua mạng thật: điểm hẹn mặc định của app (Cloudflare), hai trình duyệt riêng, đi quân đồng bộ', async ({ browser }) => run(browser, ''));
test('qua mạng thật: chỉ dùng điểm hẹn công cộng 0.peerjs.com (dự phòng)', async ({ browser }) => run(browser, 'public'));
