// Kiểm tra các lớp bảo vệ: chính sách nội dung (CSP), lọc tệp sao lưu, xin đồng ý trước khi chơi qua mạng, quyền riêng tư.
'use strict';
const { test } = require('@playwright/test');
const { openApp, showTab, aiNewGame, expect } = require('./helpers');

test('trang có CSP: mã chèn vào trang không chạy, app vẫn chạy bình thường và không vi phạm CSP', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cspv = [];
    document.addEventListener('securitypolicyviolation', e => window.__cspv.push(e.violatedDirective + ' ' + e.blockedURI));
  });
  const errors = await openApp(page);
  const meta = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  expect(meta).toContain("script-src 'self' 'wasm-unsafe-eval' 'sha256-");
  expect(meta).not.toContain("'unsafe-eval'");
  // đấu máy cấp 2: engine tự viết chạy trong Web Worker (blob:) dưới CSP
  await aiNewGame(page, { side: '1', level: 2 });
  await page.waitForFunction(() => window.__xq.Play.moves.length >= 1, null, { timeout: 20_000 });
  // chèn thẻ có thuộc tính sự kiện: CSP phải chặn
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<img src="data:," onerror="window.__pwn = 1">';
    document.body.appendChild(d);
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  // thẻ <script> lạ chèn vào trang cũng bị chặn (không có trong danh sách mã băm)
  await page.evaluate(() => { const sc = document.createElement('script'); sc.textContent = 'window.__pwn2 = 1'; document.head.appendChild(sc); });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__pwn2)).toBeUndefined();
  expect((await page.evaluate(() => window.__cspv)).length).toBeGreaterThanOrEqual(2);
  const v = await page.evaluate(() => window.__cspv);
  expect(v.filter(x => x.indexOf('script-src') !== 0 || x.indexOf('inline') < 0 && x.indexOf('eval') < 0)).toEqual([]);
  expect(errors.filter(e => !/Content Security Policy|Refused to/.test(e))).toEqual([]);
});

test('tệp sao lưu bị sửa để chèn mã thì bị từ chối; mục lạ bị bỏ qua', async ({ page }) => {
  await openApp(page);
  await showTab(page, 'about');
  const evil = { app: 'co-tuong-luyen-tap', version: '1.6.0', exportedAt: new Date().toISOString(),
    data: { games: JSON.stringify([{ id: 'g1"><img src=x onerror=alert(1)>', t: 1, user: 0, level: 1, startFen: 'x', moves: [] }]) } };
  await page.setInputFiles('#bk-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(evil)) });
  await expect(page.locator('#toast')).toContainText('không an toàn');
  await expect(page.locator('#bk-confirm')).toBeHidden();
  // tệp hợp lệ kèm một mục lạ: nhận phần hợp lệ, bỏ mục lạ
  const ok = { app: 'co-tuong-luyen-tap', version: '1.6.0', exportedAt: new Date().toISOString(),
    data: { tac_done: JSON.stringify({ t1: 1 }), la_la: '"x"' } };
  const cleaned = await page.evaluate(o => window.__xq.Backup.clean(o), ok);
  expect(Object.keys(cleaned.data)).toEqual(['tac_done']);
  // ký tự nguy hiểm trong khoá cũng bị từ chối
  const bad = { app: 'co-tuong-luyen-tap', data: { tac_done: JSON.stringify({ '<b>': 1 }) } };
  expect(await page.evaluate(o => window.__xq.Backup.clean(o), bad)).toBeNull();
});

test('chơi qua mạng: phải đồng ý trước, không đánh dấu sẵn; từ chối thì về trang chủ; rút lại được', async ({ page }) => {
  await page.addInitScript(() => { window.__XQ_SIGNAL__ = 'local'; window.__XQ_ICE__ = []; });
  await openApp(page);
  expect(await page.evaluate(() => window.__xq.Consent.VERSION)).toBe('2026-11-25');  // khớp giá trị dùng trong net*.spec.js
  await showTab(page, 'play');
  await page.click('.mode[data-m="net"]');
  await expect(page.locator('#net-consent')).toBeVisible();
  await expect(page.locator('#net-home')).toBeHidden();
  // gọi thẳng cũng không kết nối được khi chưa đồng ý
  await page.evaluate(() => window.__xq.Net.create('0', '0'));
  expect(await page.evaluate(() => window.__xq.Net.state)).toBe('idle');
  await page.click('#net-consent-no');
  await expect(page.locator('#play-home')).toBeVisible();
  expect(await page.evaluate(() => window.__xq.Consent.ok())).toBe(false);
  // đồng ý rồi tạo phòng
  await page.click('.mode[data-m="net"]');
  await page.click('#net-consent-yes');
  await expect(page.locator('#net-home')).toBeVisible();
  const c = await page.evaluate(() => window.__xq.Store.get('consent_net', null));
  expect(c.v).toBe('2026-11-25');
  expect(Date.now() - c.t).toBeLessThan(60_000);
  // rút lại ở mục Giới thiệu
  await page.evaluate(() => { window.__xq.Play.goHome(); });
  await showTab(page, 'about');
  await expect(page.locator('#pv-status')).toContainText('đã đồng ý');
  await page.click('#pv-revoke');
  await expect(page.locator('#pv-status')).toContainText('chưa đồng ý');
  expect(await page.evaluate(() => window.__xq.Consent.ok())).toBe(false);
});

test('link mời trên máy chưa đồng ý: hiện mã phòng, đồng ý xong mới vào phòng', async ({ page }) => {
  await page.addInitScript(() => { window.__XQ_SIGNAL__ = 'local'; window.__XQ_ICE__ = []; window.__XQ_JOIN_MS__ = 3000; });
  await page.goto('index.html');
  await page.waitForFunction(() => window.crossOriginIsolated === true && window.__xq && window.__xq.Play, null, { timeout: 20_000 });
  await page.goto('about:blank');
  await page.goto('index.html#phong=ABC234');
  await page.waitForFunction(() => window.__xq && window.__xq.Net && window.__xq.Net.pendingJoin === 'ABC234', null, { timeout: 10_000 });
  await expect(page.locator('#net-consent')).toBeVisible();
  await expect(page.locator('#net-consent-code')).toContainText('ABC234');
  expect(await page.evaluate(() => window.__xq.Net.state)).toBe('idle');
  await page.click('#net-consent-yes');
  await page.waitForFunction(() => ['joining', 'error'].indexOf(window.__xq.Net.state) >= 0);
  expect(await page.evaluate(() => window.__xq.Net.code)).toBe('ABC234');
});

test('xoá dữ liệu trên máy: hỏi lại trước khi xoá, xoá hết dữ liệu của app', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { window.__xq.Store.set('tac_done', { t1: 1 }); window.__xq.Consent.give(); });
  await showTab(page, 'about');
  await page.click('#pv-wipe');
  await expect(page.locator('#pv-wipe-confirm')).toBeVisible();
  await page.click('#pv-wipe-no');
  expect(await page.evaluate(() => window.__xq.Store.get('tac_done', null))).toEqual({ t1: 1 });
  await page.click('#pv-wipe');
  await Promise.all([page.waitForEvent('load'), page.click('#pv-wipe-yes')]);
  await page.waitForFunction(() => window.__xq && window.__xq.Store);
  expect(await page.evaluate(() => window.__xq.Store.get('tac_done', null))).toBeNull();
  expect(await page.evaluate(() => window.__xq.Consent.ok())).toBe(false);
});

test('báo lỗi tự nguyện: lỗi được ghi trên máy, xem trước được, không kèm dữ liệu ván cờ, xoá được', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    window.__xq.ErrLog.clear();
    window.__xq.Store.set('games', [{ id: 'gbimat', t: 1, user: 0, level: 1, startFen: 'x', moves: [], res: 'bimat-van-co' }]);
    setTimeout(() => { throw new Error('thử lỗi báo cáo'); }, 0);
  });
  await page.waitForFunction(() => window.__xq.ErrLog.list().length === 1);
  await showTab(page, 'about');
  await expect(page.locator('#rp-count')).toContainText('Có 1 lỗi');
  await page.click('#rp-show');
  const t = await page.inputValue('#rp-text');
  expect(t).toContain('thử lỗi báo cáo');
  expect(t).toContain(await page.evaluate(() => window.__xq.version));
  expect(t).not.toContain('bimat-van-co');
  await page.click('#rp-clear');
  await expect(page.locator('#rp-count')).toContainText('Chưa có lỗi');
  expect(await page.inputValue('#rp-text')).toContain('(không có)');
});
