#!/usr/bin/env node
// Chụp ảnh màn hình cho README vào docs/screenshots/. Cần chạy "npm run build" trước.
// Dùng: node scripts/screenshots.js   (đặt CHROME_PATH nếu muốn dùng Chrome có sẵn)
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const PORT = 4174, OUT = path.join(__dirname, '..', 'docs', 'screenshots');

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('http://localhost:' + PORT + '/index.html');
    await page.waitForFunction(() => window.crossOriginIsolated === true && window.__xq && window.__xq.Play, null, { timeout: 30000 });
    const shot = async name => { await page.evaluate(() => { document.querySelector('#toast').className = ''; window.scrollTo(0, 0); }); await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('đã chụp ' + name); };

    // Đấu máy: một thế cờ giữa ván
    await page.evaluate(() => {
      const P = window.__xq.Play; P.level = 3; P.user = 0; document.querySelector('#play-side').value = '0'; P.gen++; P.newGame();
      for (const s of ['炮二平五', '馬8進7', '傌二進三', '車9平8', '車一平二', '卒7進1', '車二進六', '馬2進3']) P.doMove(P.ctx.pos.parse(s), false);
      P.thinking = false; P.draw();
    });
    await shot('dau-may');

    // Phân tích ván
    await page.evaluate(() => {
      const A = window.__xq.Ana, S = window.__xq.Store;
      A.games.unshift({ id: 'gshot', t: Date.now(), user: 0, level: 3, startFen: XQ.START_FEN, moves: ['h2e2', 'h9g7', 'e2e6', 'g7e6', 'h0g2', 'i9h9'], res: 'Ván thử' });
      S.set('ana_mode', 'fast'); window.__xq.showTab('ana'); A.open('gshot');
    });
    await page.waitForFunction(() => window.__xq.Ana.cur && window.__xq.Ana.cur.ana, null, { timeout: 120000 });
    await shot('phan-tich');

    // Khai cuộc
    await page.evaluate(() => { window.__xq.showTab('op'); document.querySelectorAll('#op-list details')[2].open = true; });
    await shot('khai-cuoc');

    // Chiến thuật
    await page.evaluate(() => { window.__xq.showTab('tac'); const T = window.__xq.Tac; T.mode = 'free'; T.open(TACTICS[5].id); });
    await shot('chien-thuat');
  } finally {
    await browser.close(); srv.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
