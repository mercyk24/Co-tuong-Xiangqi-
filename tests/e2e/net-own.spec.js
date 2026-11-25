// Kiểm tra chơi qua mạng với điểm hẹn riêng của app (server/), chạy thật trên máy bằng server/dev-server.mjs.
// Cùng lõi với bản Cloudflare (server/core.mjs), nên kiểm tra được giao thức thật: phòng riêng, chuyển tin khi
// không nối thẳng được (RELAY), báo rời phòng (LEAVE), và chuyển sang điểm hẹn dự phòng khi điểm hẹn đầu hỏng.
// Đặt XQ_SIGNAL_URL (ví dụ ws://127.0.0.1:8787 khi chạy "npx wrangler dev") để thử điểm hẹn chính với bản Cloudflare.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { test } = require('@playwright/test');
const { expect } = require('./helpers');

test.describe.configure({ timeout: 120_000 });

let S1, S2;   // hai điểm hẹn chạy thử
const DEAD = 'ws://127.0.0.1:1';   // địa chỉ không có máy chủ nào
test.beforeAll(async () => {
  const { startServer } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'server', 'dev-server.mjs')).href);
  if (!process.env.XQ_SIGNAL_URL) S1 = await startServer(4181);
  S2 = await startServer(4182);
});
test.afterAll(async () => { if (S1) await S1.close(); if (S2) await S2.close(); });
const U1 = process.env.XQ_SIGNAL_URL || 'ws://127.0.0.1:4181', U2 = 'ws://127.0.0.1:4182';

async function device(context, errors, opt) {
  const p = await context.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(o => {
    try { localStorage.removeItem('xq_net_sess'); } catch (e) { /* bỏ qua */ }
    window.__XQ_SIGNAL__ = o.servers; window.__XQ_ICE__ = []; window.__XQ_JOIN_MS__ = 20000;
    if (o.noP2P) { window.__XQ_NO_P2P__ = true; window.__XQ_P2P_MS__ = 1500; }
  }, opt);
  await p.goto('index.html');
  await p.waitForFunction(() => window.crossOriginIsolated === true && window.__xq && window.__xq.Play, null, { timeout: 20_000 });
  return p;
}
const net = p => p.evaluate(() => ({ state: window.__xq.Net.state, link: window.__xq.Net.link, si: window.__xq.Net.si, err: window.__xq.Net.err, notes: window.__xq.Play.notes.length }));
const move = (p, s) => p.evaluate(x => { const P = window.__xq.Play; P.doMove(P.ctx.pos.parse(x), true); }, s);
const logs = async (A, B) => {
  console.log('Nhật ký A:\n' + (await A.evaluate(() => window.__xq.Net.log.join('\n'))));
  console.log('Nhật ký B:\n' + (await B.evaluate(() => window.__xq.Net.log.join('\n'))));
};
async function room(context, errors, a, b) {
  const A = await device(context, errors, a);
  await A.evaluate(() => { window.__xq.Play.setMode('net'); return window.__xq.Net.create('0', '0'); });
  await A.waitForFunction(() => window.__xq.Net.state === 'waiting', null, { timeout: 20_000 });
  const code = await A.evaluate(() => window.__xq.Net.code);
  const B = await device(context, errors, b);
  await B.evaluate(c => { window.__xq.Play.setMode('net'); return window.__xq.Net.join(c); }, code);
  try {
    await B.waitForFunction(() => window.__xq.Net.state === 'playing', null, { timeout: 40_000 });
    await A.waitForFunction(() => window.__xq.Net.state === 'playing', null, { timeout: 10_000 });
  } catch (e) { await logs(A, B); throw e; }
  return { A, B, code };
}

test('điểm hẹn riêng: hai máy nối thẳng, đi quân đồng bộ', async ({ context }) => {
  const errors = [];
  const { A, B } = await room(context, errors, { servers: [U1] }, { servers: [U1] });
  expect((await net(A)).link).toBe('dc'); expect((await net(B)).link).toBe('dc');
  await move(A, '炮二平五'); await B.waitForFunction(() => window.__xq.Play.notes.length === 1);
  await move(B, '馬8進7'); await A.waitForFunction(() => window.__xq.Play.notes.length === 2);
  expect(errors).toEqual([]);
});

test('mạng chặn nối thẳng: ván tự đi qua điểm hẹn, xin hòa được, rớt điểm hẹn thì nối lại và đồng bộ', async ({ context }) => {
  const errors = [];
  const { A, B } = await room(context, errors, { servers: [U1] }, { servers: [U1], noP2P: true });
  expect((await net(A)).link).toBe('relay'); expect((await net(B)).link).toBe('relay');
  await move(A, '炮二平五'); await B.waitForFunction(() => window.__xq.Play.notes.length === 1);
  await move(B, '馬8進7'); await A.waitForFunction(() => window.__xq.Play.notes.length === 2);
  // Xin hòa qua điểm hẹn, bên kia từ chối
  await B.evaluate(() => window.__xq.Play.askDraw(1));
  await expect(A.locator('#play-ask-text')).toHaveText('Đối thủ xin hòa. Bạn có đồng ý không?');
  await A.click('#play-ask-no');
  await expect(B.locator('#toast')).toContainText('không đồng ý xin hòa');
  // Máy khách mất điểm hẹn: chủ phòng biết ngay (LEAVE), khách tự nối lại qua điểm hẹn, ván vẫn đủ nước
  await B.evaluate(() => { const s = window.__xq.Net.sig; const cb = s.onClose; s.close(); cb(); });
  await A.waitForFunction(() => window.__xq.Net.state === 'lost' || window.__xq.Net.log.some(l => l.includes('khách nối qua điểm hẹn')), null, { timeout: 10_000 });
  try {
    await B.waitForFunction(() => window.__xq.Net.state === 'playing' && window.__xq.Net.link === 'relay', null, { timeout: 30_000 });
    await A.waitForFunction(() => window.__xq.Net.state === 'playing', null, { timeout: 15_000 });
  } catch (e) { await logs(A, B); throw e; }
  expect((await net(A)).notes).toBe(2); expect((await net(B)).notes).toBe(2);
  await move(A, '馬二進三'); await B.waitForFunction(() => window.__xq.Play.notes.length === 3);
  expect(errors).toEqual([]);
});

test('điểm hẹn đầu tiên hỏng: cả hai máy tự chuyển sang điểm hẹn dự phòng', async ({ context }) => {
  const errors = [];
  const { A, B } = await room(context, errors, { servers: [DEAD, U2] }, { servers: [DEAD, U2] });
  expect((await net(A)).si).toBe(1); expect((await net(B)).si).toBe(1);
  await move(A, '炮二平五'); await B.waitForFunction(() => window.__xq.Play.notes.length === 1);
  expect(errors).toEqual([]);
});

test('chủ phòng ở điểm hẹn dự phòng: khách không thấy phòng ở điểm hẹn đầu thì tìm tiếp ở điểm hẹn sau', async ({ context }) => {
  const errors = [];
  // A chỉ vào được điểm hẹn 2; B thử điểm hẹn 1 trước (chạy bình thường nhưng không có phòng) rồi mới tới 2
  const { A, B } = await room(context, errors, { servers: [U2] }, { servers: [U1, U2] });
  expect((await net(B)).si).toBe(1);
  expect(await B.evaluate(() => window.__xq.Net.log.some(l => l.includes('không thấy phòng ở điểm hẹn 0')))).toBe(true);
  await move(A, '炮二平五'); await B.waitForFunction(() => window.__xq.Play.notes.length === 1);
  expect(errors).toEqual([]);
});

test('sai mã phòng trên điểm hẹn riêng: báo không tìm thấy ngay, không phải chờ', async ({ context }) => {
  const errors = [];
  const B = await device(context, errors, { servers: [U1] });
  const t0 = Date.now();
  await B.evaluate(() => { window.__xq.Play.setMode('net'); return window.__xq.Net.join('ZZZZ99'); });
  await B.waitForFunction(() => window.__xq.Net.state === 'error', null, { timeout: 10_000 });
  expect(Date.now() - t0).toBeLessThan(5000);
  await expect(B.locator('#net-err')).toContainText('Không tìm thấy phòng ZZZZ99');
  expect(errors).toEqual([]);
});
