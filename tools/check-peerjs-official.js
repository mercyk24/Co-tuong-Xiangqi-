#!/usr/bin/env node
// So sánh: dùng chính thư viện PeerJS chính thức (bản 1.5.5) nối hai trình duyệt qua 0.peerjs.com.
// Nếu thư viện chính thức cũng không nối được thì lỗi nằm ở điểm hẹn 0.peerjs.com, không phải ở app.
// Chuẩn bị (không ghi vào package.json):  npm i --no-save peerjs@1.5.5
// Chạy:  node tools/check-peerjs-official.js
'use strict';
const fs = require('fs');
const { chromium } = require('@playwright/test');

const lib = fs.readFileSync(require.resolve('peerjs/dist/peerjs.min.js'), 'utf8');
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = async name => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    p.on('console', m => log(name, m.text()));
    await p.goto('about:blank');
    await p.addScriptTag({ content: lib });
    return p;
  };
  const A = await page('A'), B = await page('B');
  const idA = 'xqvn-off' + Math.random().toString(36).slice(2, 9);
  await A.evaluate(id => new Promise((res, rej) => {
    const peer = new window.Peer(id, { debug: 1 });
    peer.on('open', () => { console.log('đã vào điểm hẹn: ' + id); res(); });
    peer.on('error', e => { console.log('LỖI ' + e.type + ': ' + e.message); rej(e.type); });
    peer.on('connection', c => c.on('data', d => { console.log('nhận: ' + d); c.send('chào lại'); }));
    setTimeout(() => rej('quá giờ'), 20000);
  }), idA);
  const ok = await B.evaluate(id => new Promise(res => {
    const peer = new window.Peer({ debug: 1 });
    peer.on('error', e => { console.log('LỖI ' + e.type + ': ' + e.message); res(false); });
    peer.on('open', me => {
      console.log('đã vào điểm hẹn: ' + me);
      const c = peer.connect(id, { reliable: true });
      c.on('open', () => { console.log('kênh dữ liệu mở'); c.send('xin chào'); });
      c.on('data', d => { console.log('nhận: ' + d); res(true); });
    });
    setTimeout(() => res(false), 30000);
  }), idA);
  log(ok ? 'THƯ VIỆN CHÍNH THỨC NỐI ĐƯỢC' : 'THƯ VIỆN CHÍNH THỨC CŨNG KHÔNG NỐI ĐƯỢC');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { log('LỖI', e && e.message || e); process.exit(1); });
