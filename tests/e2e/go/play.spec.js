// [CỜ VÂY] Kiểm tra giao diện app cờ vây (/co-vay/): đấu máy, hai người (ăn quân, kiếp, tự sát, bỏ lượt, đếm điểm, quân chết),
// bàn lớn bấm hai lần, chơi qua mạng (cỡ bàn theo chủ phòng, tiền tố xgvn-), dữ liệu tách riêng (xv_).
'use strict';
const { test } = require('@playwright/test');
const { expect } = require('../helpers');

test.describe.configure({ timeout: 90_000 });

async function openGo(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('co-vay/index.html');
  await page.waitForFunction(() => window.__xv && window.__xv.Play);
  await page.waitForFunction(() => window.crossOriginIsolated === true, null, { timeout: 20_000 });
  await page.waitForFunction(() => window.__xv && window.__xv.Play);
  return errors;
}
// Bấm vào giao điểm (tên dạng 'D4') trên bàn cờ có id cho trước
async function tap(page, name, boardSel = '#play-board', obj = 'Play') {
  const pt = await page.evaluate(([n, sel, o]) => {
    const b = window.__xv[o].board, p = GO.Pos.fromFen(GO.emptyFen(b.n)).pointOf(n), svg = document.querySelector(sel + ' svg'), r = svg.getBoundingClientRect();
    return { x: r.left + b.X(p % b.n) * r.width / b.W, y: r.top + b.Y((p / b.n) | 0) * r.height / b.W };
  }, [name, boardSel, obj]);
  await page.mouse.click(pt.x, pt.y);
}
const play = (page, list) => page.evaluate(l => { const P = window.__xv.Play; for (const u of l) P.doMove(P.ctx.pos.parse(u), true); return P.moves.length; }, list);
async function pvp(page, size) {
  await page.click('.mode[data-m="pvp"]');
  if (size) await page.click('#pvp-size .chip[data-v="' + size + '"]');
  await page.click('#pvp-times .btn[data-k="0"]');
  await expect(page.locator('#play-board')).toBeVisible();
}

test('cờ vây: đấu máy, bấm để đặt quân, máy đáp nước hợp lệ; dữ liệu lưu riêng (xv_)', async ({ page }) => {
  const errors = await openGo(page);
  await expect(page.locator('.hero h1')).toHaveText('Cờ Vây');
  await page.click('.mode[data-m="ai"]');
  await page.click('#ai-side .chip[data-v="0"]');
  await page.click('#ai-size .chip[data-v="9"]');
  await page.click('#ai-var .chip[data-v="area"]');
  await page.click('#ai-levels .lvl[data-v="1"]');
  await page.click('#ai-start');
  await tap(page, 'E5');
  await page.waitForFunction(() => window.__xv.Play.moves.length >= 2, null, { timeout: 20_000 });
  const st = await page.evaluate(() => ({ notes: window.__xv.Play.notes.slice(), n: window.__xv.Play.ctx.pos.n }));
  expect(st.notes[0]).toBe('E5');
  expect(st.n).toBe(9);
  await expect(page.locator('#go-pass')).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some(k => k.indexOf('xv_') === 0)).toBe(true);
  expect(keys.filter(k => k.indexOf('xq_') === 0 || k.indexOf('xc_') === 0)).toEqual([]);
  // Cờ bắt quân: thế bắt đầu có cờ 'cg', dòng thông tin nhắc luật
  await page.click('#pbar-bot [data-act="menu"]'); await page.click('#am-home');
  await page.click('#home-resume-drop');
  await page.click('.mode[data-m="ai"]');
  await page.click('#ai-var .chip[data-v="cg"]');
  await page.click('#ai-start');
  expect(await page.evaluate(() => window.__xv.Play.startFen)).toMatch(/ cg$/);
  await expect(page.locator('#go-info')).toContainText('Cờ bắt quân');
  await expect(page.locator('#go-pass')).toBeHidden();
  await page.evaluate(() => window.__xv.Store.set('go_var', 'area'));
  expect(errors).toEqual([]);
});

test('cờ vây đấu KataGo (cấp 4): tải mạng nơ-ron, máy đi đúng nước đầu tiên KataGo nghĩ ra, gợi ý nước, Cài đặt báo sẵn sàng', async ({ page }) => {
  const errors = await openGo(page);
  await page.click('.mode[data-m="ai"]');
  await page.click('#ai-side .chip[data-v="0"]');
  await page.click('#ai-size .chip[data-v="9"]');
  await page.click('#ai-var .chip[data-v="area"]');
  await page.click('#ai-levels .lvl[data-v="4"]');
  await page.click('#ai-start');
  await page.waitForFunction(() => window.__xv.Kata.state === 'ready', null, { timeout: 60_000 });
  await tap(page, 'E5');
  await page.waitForFunction(() => window.__xv.Play.moves.length >= 2, null, { timeout: 30_000 });
  const same = await page.evaluate(async () => {
    const P = window.__xv.Play, r = await window.__xv.Kata.call({ type: 'search', fen: P.startFen, moves: P.moves.slice(0, 1), opts: { visits: 1 } });
    return [r.move, P.moves[1]];
  });
  expect(same[0]).toBe(same[1]);
  await page.evaluate(() => window.__xv.Play.showHint());
  await page.waitForFunction(() => window.__xv.Play.hint, null, { timeout: 30_000 });
  await expect(page.locator('#kata-state')).toContainText('Đã sẵn sàng', { useInnerText: false });
  expect(await page.evaluate(() => window.__xv.Kata.info.backend)).toBe('wasm');
  expect(errors).toEqual([]);
});

test('cờ vây hai người: ăn quân, kiếp, cấm tự sát, bỏ lượt hai lần thì đếm điểm, sửa quân chết rồi xác nhận', async ({ page }) => {
  const errors = await openGo(page);
  await pvp(page, 9);
  // Đen bao quanh E5 rồi ăn
  await play(page, ['D5', 'E5', 'F5', 'A9', 'E6']);
  await tap(page, 'A8');                                    // Trắng đi chỗ khác
  await tap(page, 'E4');                                    // Đen ăn E5
  expect(await page.evaluate(() => window.__xv.Play.ctx.pos.caps)).toEqual([1, 0]);
  await expect(page.locator('#go-info')).toContainText('Đen đã ăn 1');
  // Trắng đặt vào E5 (tự sát) bị chặn, có lời nhắc
  await tap(page, 'E5');
  await expect(page.locator('#toast')).toContainText('tự sát');
  expect(await page.evaluate(() => window.__xv.Play.moves.length)).toBe(7);
  // Bỏ lượt hai lần -> bảng đếm điểm; quân Trắng A9, A8 lọt trong vùng Đen được máy đánh dấu chết hoặc bấm để đánh dấu
  await page.click('#go-pass'); await page.click('#go-pass');
  await expect(page.locator('#go-score')).toBeVisible();
  await page.waitForFunction(() => window.__xv.Play.scoring && !window.__xv.Play.scoring.busy);   // máy đoán quân chết trong Worker
  await expect(page.locator('#go-score-ok')).toBeEnabled();
  const deadA9 = await page.evaluate(() => window.__xv.Play.scoring.dead.has(GO.Pos.fromFen(GO.emptyFen(9)).pointOf('A9')));
  if (!deadA9) await tap(page, 'A9');
  expect(await page.evaluate(() => window.__xv.Play.scoring.dead.has(0))).toBe(true);
  await tap(page, 'A9');                                    // bấm lại: thành sống
  expect(await page.evaluate(() => window.__xv.Play.scoring.dead.has(0))).toBe(false);
  await tap(page, 'A9');
  await page.click('#go-score-ok');
  await expect(page.locator('#play-result')).toBeVisible();
  await expect(page.locator('#play-result-text')).toContainText('Đen thắng');
  expect(errors).toEqual([]);
});

test('cờ vây: kiếp không được ăn lại ngay; "Chơi tiếp" sau khi bỏ lượt thì đánh tiếp được', async ({ page }) => {
  await openGo(page);
  await pvp(page, 9);
  // Hình kiếp: Đen C5 B4 C3, Trắng D5 C4? -> dựng bằng nước đi
  await play(page, ['C5', 'D5', 'B4', 'E4', 'C3', 'D3', 'A9', 'C4']);
  await tap(page, 'D4');                                    // Đen ăn C4 (kiếp)
  expect(await page.evaluate(() => window.__xv.Play.ctx.pos.caps[0])).toBe(1);
  await tap(page, 'C4');                                    // Trắng ăn lại ngay: không được
  await expect(page.locator('#toast')).toContainText('Kiếp');
  await page.click('#go-pass'); await page.click('#go-pass');
  await expect(page.locator('#go-score')).toBeVisible();
  await page.click('#go-score-resume');
  await expect(page.locator('#go-score')).toBeHidden();
  await tap(page, 'J1');
  expect(await page.evaluate(() => window.__xv.Play.notes.slice(-1)[0])).toBe('J1');
});

test('cờ vây: bàn 19×19 bấm lần đầu hiện quân nháp, bấm lại mới đặt; bàn 9×9 bấm một lần', async ({ page }) => {
  await openGo(page);
  await pvp(page, 19);
  expect(await page.evaluate(() => window.__xv.Play.ctx.pos.n)).toBe(19);
  await tap(page, 'Q16');
  expect(await page.evaluate(() => [window.__xv.Play.moves.length, window.__xv.Play.ctx.sel])).toEqual([0, 3 * 19 + 15]);
  await tap(page, 'D4');                                    // đổi chỗ quân nháp
  expect(await page.evaluate(() => window.__xv.Play.moves.length)).toBe(0);
  await tap(page, 'D4');
  expect(await page.evaluate(() => window.__xv.Play.notes)).toEqual(['D4']);
  await page.click('#pbar-bot [data-act="menu"]'); await page.click('#pm-home'); await page.click('#home-resume-drop');
  await pvp(page, 9);
  await tap(page, 'C3');
  expect(await page.evaluate(() => window.__xv.Play.notes)).toEqual(['C3']);
});

test('cờ vây qua mạng: cỡ bàn theo chủ phòng, đi nước hai chiều, bỏ lượt hai lần thì hai máy cùng một kết quả; tiền tố xgvn-', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { localStorage.setItem('xv_consent_net', '{"v":"2026-11-25","t":1}'); window.__XQ_SIGNAL__ = 'local'; window.__XQ_ICE__ = []; });
  const A = await ctx.newPage(); await A.goto('co-vay/index.html');
  await A.waitForFunction(() => window.crossOriginIsolated === true && window.__xv && window.__xv.Play, null, { timeout: 20_000 });
  await A.click('.mode[data-m="net"]');
  await A.click('#net-go-create');
  await A.click('#net-size .chip[data-v="13"]');
  await A.selectOption('#net-side', '0');
  await A.locator('#net-times .btn[data-k="0"]').click();
  await expect(A.locator('#net-code-show')).toHaveText(/^[A-Z2-9]{6}$/);
  const code = await A.locator('#net-code-show').innerText();
  expect(await A.evaluate(() => window.__xv.Net.myId)).toMatch(/^xgvn-/);
  const B = await ctx.newPage(); await B.goto('co-vay/index.html');
  await B.waitForFunction(() => window.crossOriginIsolated === true && window.__xv && window.__xv.Play, null, { timeout: 20_000 });
  await B.evaluate(() => { window.__xv.Store.set('go_size', 9); window.__xv.Play.setMode('net'); });
  await B.fill('#net-code', code); await B.click('#net-join');
  await A.waitForFunction(() => window.__xv.Net.state === 'playing', null, { timeout: 30_000 });
  await B.waitForFunction(() => window.__xv.Net.state === 'playing', null, { timeout: 30_000 });
  expect(await B.evaluate(() => window.__xv.Play.ctx.pos.n)).toBe(13);   // khách chọn 9 nhưng phòng là 13×13
  await A.evaluate(() => { const P = window.__xv.Play; P.doMove(P.ctx.pos.parse('D4'), true); });
  await B.waitForFunction(() => window.__xv.Play.moves.length === 1);
  await B.evaluate(() => { const P = window.__xv.Play; P.doMove(P.ctx.pos.parse('K10'), true); });
  await A.waitForFunction(() => window.__xv.Play.moves.length === 2);
  expect(await A.evaluate(() => window.__xv.Play.notes)).toEqual(['D4', 'K10']);
  await A.evaluate(() => window.__xv.Play.doMove(GO.PASS, true));
  await B.waitForFunction(() => window.__xv.Play.moves.length === 3);
  await B.evaluate(() => window.__xv.Play.doMove(GO.PASS, true));
  await A.waitForFunction(() => !!window.__xv.Play.over);
  await B.waitForFunction(() => !!window.__xv.Play.over);
  const ra = await A.evaluate(() => window.__xv.Play.over), rb = await B.evaluate(() => window.__xv.Play.over);
  expect(ra).toBe(rb);
  expect(ra).toContain('Trắng thắng');
  await ctx.close();
});
