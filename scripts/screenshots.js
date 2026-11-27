#!/usr/bin/env node
// [DÙNG CHUNG] Chụp ảnh màn hình cho README vào docs/screenshots/ (trang chủ và ba loại cờ). Cần chạy "npm run build" trước.
// Dùng: node scripts/screenshots.js   (đặt CHROME_PATH nếu muốn dùng Chrome có sẵn)
// Cờ vây dùng KataGo (tải engine/kata-*.kgo như người dùng thật), nên lần chạy mất khoảng một phút.
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const PORT = 4174, OUT = path.join(__dirname, '..', 'docs', 'screenshots'), BASE = 'http://localhost:' + PORT + '/';

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
    const page = await ctx.newPage();
    // Mở một app và chờ app tự tải lại lần đầu (bật COOP/COEP) xong
    const open = async (url, g) => {
      await page.goto(BASE + url);
      await page.waitForFunction(k => window.crossOriginIsolated === true && window[k] && window[k].Play, g, { timeout: 30000 });
    };
    const shot = async (name, el) => {
      await page.evaluate(() => { const t = document.querySelector('#toast'); if (t) t.className = ''; });
      if (!el) await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      if (el) await page.locator(el).first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, name + '.png') });
      console.log('đã chụp ' + name);
    };

    // ---------- Trang chủ ----------
    await page.goto(BASE + 'index.html');
    await shot('trang-chu');

    // ---------- Cờ tướng (tên tệp giữ như cũ) ----------
    await open('co-tuong/index.html', '__xq');
    await page.click('.mode[data-m="ai"]');
    await page.click('#ai-side .chip[data-v="0"]');
    await page.click('#ai-levels .lvl[data-v="3"]');
    await page.click('#ai-start');
    await page.evaluate(() => {
      const P = window.__xq.Play;
      for (const s of ['炮二平五', '馬8進7', '傌二進三', '車9平8', '車一平二', '卒7進1', '車二進六', '馬2進3']) P.doMove(P.ctx.pos.parse(s), false);
      P.thinking = false; P.draw();
    });
    await shot('dau-may');
    await page.evaluate(() => {
      const A = window.__xq.Ana, S = window.__xq.Store;
      A.games.unshift({ id: 'gshot', t: Date.now(), user: 0, level: 3, startFen: XQ.START_FEN, moves: ['h2e2', 'h9g7', 'e2e6', 'g7e6', 'h0g2', 'i9h9'], res: 'Ván thử' });
      S.set('ana_mode', 'fast'); window.__xq.showTab('ana'); A.open('gshot');
    });
    await page.waitForFunction(() => window.__xq.Ana.cur && window.__xq.Ana.cur.ana, null, { timeout: 120000 });
    await shot('phan-tich');
    await page.evaluate(() => { window.__xq.showTab('op'); document.querySelectorAll('#op-list details')[2].open = true; });
    await shot('khai-cuoc');
    await page.evaluate(() => { window.__xq.showTab('tac'); const T = window.__xq.Tac; T.mode = 'free'; T.open(TACTICS[5].id); });
    await shot('chien-thuat');

    // ---------- Cờ vua ----------
    await open('co-vua/index.html', '__xc');
    await page.click('.mode[data-m="ai"]');
    await page.click('#ai-side .chip[data-v="0"]');
    await page.click('#ai-levels .lvl[data-v="3"]');
    await page.click('#ai-start');
    await page.evaluate(() => {
      const P = window.__xc.Play;
      for (const u of 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6 e1g1 a7a6'.split(' ')) P.doMove(P.ctx.pos.parse(u), false);
      P.thinking = false; P.draw();
    });
    await shot('co-vua-dau-may');
    await page.evaluate(() => { window.__xc.showTab('tac'); window.__xc.Tac.open(TACTICS[7].id); });
    await shot('co-vua-chien-thuat');
    await page.evaluate(() => { window.__xc.showTab('op'); const L = OPENINGS.lines.find(l => OPENINGS.groups[l.group].side === 0); window.__xc.Op.open(L, 'study'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { for (let i = 0; i < 6; i++) { const b = document.querySelector('#op-next'); if (b && !b.disabled) b.click(); } });
    await shot('co-vua-khai-cuoc');

    // ---------- Cờ vây ----------
    await open('co-vay/index.html', '__xv');
    const ok = await page.evaluate(() => window.__xv.Kata.ensure(true));
    if (!ok) throw new Error('KataGo không chạy được');
    // Một ván 13×13 do KataGo tự đánh với chính nó (đọc khoảng 24 nước mỗi lượt; hai nước cố ý đi dở), dùng cho cả ảnh đấu máy lẫn ảnh phân tích
    const moves = await page.evaluate(async () => {
      const K = window.__xv.Kata, fen = GO.emptyFen(13), mv = [], P = GO.Pos.fromFen(fen);
      for (let i = 0; i < 90; i++) {
        let m = 0;
        // Hai nước cố ý đi dở (đặt quân ở mép bàn) để ảnh phân tích có dấu ?? và nước KataGo đề nghị
        if (i === 34 || i === 57) m = ['A1', 'N1', 'A13', 'N13', 'G1', 'A7', 'N7', 'G13'].map(x => P.parse(x)).find(x => x && P.isLegal(x)) || 0;
        if (!m) {
          const r = await K.call({ type: 'search', fen, moves: mv, opts: { visits: 24, timeMs: 3000, seed: 11 + i } });
          if (!r || !r.move || r.move === GO.PASS) break;
          m = r.move;
        }
        mv.push(m); P.make(m);
      }
      return mv;
    });
    await page.evaluate(() => window.__xv.Store.set('go_size', 13));
    await page.click('.mode[data-m="ai"]');
    await page.click('#ai-side .chip[data-v="0"]');
    await page.click('#ai-size .chip[data-v="13"]');
    await page.click('#ai-levels .lvl[data-v="5"]');
    await page.click('#ai-start');
    await page.evaluate(mv => { const P = window.__xv.Play; for (const m of mv.slice(0, 30)) P.doMove(m, false); P.thinking = false; P.draw(); }, moves);
    await shot('co-vay-dau-may');
    await page.evaluate(() => { window.__xv.showTab('les'); window.__xv.Les.open(2); });
    await shot('co-vay-bai-hoc');
    await page.evaluate(mv => {
      const A = window.__xv.Ana;
      A.games.unshift({ id: 'gshot', t: Date.now(), user: 0, level: 5, startFen: GO.emptyFen(13), moves: mv.map(m => GO.mvStr(m)), res: 'Ván thử' });
      window.__xv.showTab('ana'); A.open('gshot'); A.analyzeAll();
    }, moves);
    await page.waitForFunction(() => window.__xv.Ana.ana && !window.__xv.Ana.anaBusy, null, { timeout: 300000 });
    await page.evaluate(() => { const b = document.querySelector('#ana-mist [data-k]'); if (b) b.click(); });
    await shot('co-vay-phan-tich', '#ana-board');
  } finally {
    await browser.close(); srv.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
