// [CỜ VÂY] Kiểm tra các tab luyện tập của app cờ vây: Bài học luật, Bắt quân, Ván đã lưu (xem lại, SGF, ước lượng điểm).
'use strict';
const { test } = require('@playwright/test');
const { expect } = require('../helpers');

test.describe.configure({ timeout: 90_000 });

async function openGo(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('co-vay/index.html');
  // Lần đầu mở, app có thể tự tải lại một lần (đăng ký service worker để bật cách ly COOP/COEP): chờ xong rồi mới bấm,
  // nếu không lần tải lại rơi vào giữa bài kiểm tra (máy chạy CI chậm từng bị như vậy ở bài "ván đã lưu").
  await page.waitForFunction(() => window.crossOriginIsolated === true, null, { timeout: 20_000 });
  await page.waitForFunction(() => window.__xv && window.__xv.Play);
  return errors;
}
async function tap(page, name, boardSel, obj) {
  const pt = await page.evaluate(([n, sel, o]) => {
    const b = window.__xv[o].board, p = GO.Pos.fromFen(GO.emptyFen(b.n)).pointOf(n), svg = document.querySelector(sel + ' svg'), r = svg.getBoundingClientRect();
    return { x: r.left + b.X(p % b.n) * r.width / b.W, y: r.top + b.Y((p / b.n) | 0) * r.height / b.W };
  }, [name, boardSel, obj]);
  await page.mouse.click(pt.x, pt.y);
}

test('bài học: đi đúng thì được qua bước, đi sai thì được nhắc; xong bài thì đánh dấu', async ({ page }) => {
  const errors = await openGo(page);
  await page.click('#play-home .drill[data-go="les"]');
  await page.click('#les-list .pz[data-id="3"]');
  await expect(page.locator('#les-next')).toBeDisabled();
  await tap(page, 'A1', '#les-board', 'Les');
  await expect(page.locator('#les-status')).toContainText('chưa ăn được');
  await tap(page, 'D3', '#les-board', 'Les');
  await expect(page.locator('#les-next')).toBeEnabled();
  await page.click('#les-next');
  await tap(page, 'E3', '#les-board', 'Les'); await page.click('#les-next');
  await tap(page, 'A3', '#les-board', 'Les'); await page.click('#les-next');
  expect(await page.evaluate(() => window.__xv.Store.get('les_done', []))).toEqual([3]);
  // Bài thang: máy chạy, người chơi đuổi tới khi bắt được
  await page.evaluate(() => window.__xv.Les.open(8));
  for (let k = 0; k < 10 && !(await page.evaluate(() => window.__xv.Les.done)); k++) {
    await page.waitForFunction(() => !window.__xv.Les.busy);
    const mv = await page.evaluate(() => { const L = window.__xv.Les, p = L.pos; return p.notation(GO.captureMoves(p, p.pointOf('E5'), L.left)[0]); });
    await tap(page, mv, '#les-board', 'Les');
  }
  expect(await page.evaluate(() => window.__xv.Les.done)).toBe(true);
  expect(errors).toEqual([]);
});

test('bắt quân: nước sai bị từ chối, nước đúng thì máy chạy; bắt được thì xong bài', async ({ page }) => {
  const errors = await openGo(page);
  await page.click('#play-home .drill[data-go="puz"]');
  await expect(page.locator('#puz-list .pz')).not.toHaveCount(0);
  const id = await page.evaluate(() => PUZZLES.find(p => p.n === 3).id);
  await page.evaluate(i => window.__xv.Puz.open(i), id);
  // một nước sai: điểm trống không nằm trong danh sách nước bắt được
  const bad = await page.evaluate(() => { const P = window.__xv.Puz, p = P.pos, good = P.goodMoves(); for (const m of p.legalMoves()) if (m !== GO.PASS && !good.includes(m)) return p.notation(m); return ''; });
  await tap(page, bad, '#puz-board', 'Puz');
  await expect(page.locator('#puz-status')).toContainText('Chưa đúng');
  for (let k = 0; k < 6 && !(await page.evaluate(() => window.__xv.Puz.solved)); k++) {
    await page.waitForFunction(() => !window.__xv.Puz.busy);
    const mv = await page.evaluate(() => { const P = window.__xv.Puz; return P.pos.notation(P.goodMoves()[0]); });
    await tap(page, mv, '#puz-board', 'Puz');
  }
  await expect(page.locator('#puz-next')).toBeVisible();
  expect(await page.evaluate(() => window.__xv.Store.get('puz_done', []))).toContain(id);
  expect(errors).toEqual([]);
});

test('ván đã lưu: ván hai người được lưu, xem lại, xuất SGF, nhập SGF, ước lượng điểm', async ({ page }) => {
  const errors = await openGo(page);
  await page.click('.mode[data-m="pvp"]');
  await page.click('#pvp-size .chip[data-v="9"]');
  await page.click('#pvp-times .btn[data-k="0"]');
  await page.evaluate(() => { const P = window.__xv.Play; for (const u of ['C3', 'G7', 'G3', 'C7', 'E5', 'E3', 'D3', 'E4', 'F4', 'D4', 'pass', 'pass']) P.doMove(P.ctx.pos.parse(u), true); });
  await expect(page.locator('#go-score')).toBeVisible();
  await page.click('#go-score-ok');
  await page.click('#play-result-ana');
  await expect(page.locator('#ana-detail')).toBeVisible();
  await expect(page.locator('#ana-info')).toContainText('Nước 12/12');
  await page.click('#ana-first');
  await expect(page.locator('#ana-info')).toContainText('Nước 0/12');
  await page.locator('#ana-moves .mv[data-i="4"]').click();
  await expect(page.locator('#ana-info')).toContainText('Nước 5/12');
  const sgf = await page.evaluate(() => window.__xv.Ana.sgfText());
  expect(sgf).toMatch(/^\(;GM\[1\]FF\[4\]/);
  expect(sgf).toContain('SZ[9]');
  expect(sgf).toContain(';B[cg]');
  expect(sgf).toMatch(/RE\[[BW]\+[\d.]+\]/);
  await page.click('#ana-est');
  await expect(page.locator('#ana-est-text')).toContainText('Đếm theo đất', { timeout: 40_000 });
  // Nhập SGF (có tên người chơi chứa ký tự lạ: phải được làm sạch)
  await page.click('#ana-back');
  await page.fill('#ana-paste', '(;GM[1]FF[4]SZ[13]KM[6.5]PB[An <b>"x"</b>]PW[Bình]RE[W+R];B[dd];W[jj];B[];W[dj])');
  await page.click('#ana-imp-text');
  await expect(page.locator('#ana-info')).toContainText('Nước 4/4');
  const g = await page.evaluate(() => window.__xv.Ana.cur);
  expect(g.startFen.split(' ').slice(0, 3)).toEqual(['13', 'b', '6.5']);
  expect(g.pb).toBe('An bx/b');
  expect(g.res).toBe('Trắng thắng (đối thủ chịu thua)');
  expect(await page.evaluate(() => window.__xv.Ana.games.length)).toBe(2);
  // SGF hỏng: báo lỗi, không thêm ván
  await page.click('#ana-back');
  await page.fill('#ana-paste', '(;SZ[9];B[ee];W[ee])');
  await page.click('#ana-imp-text');
  await expect(page.locator('#toast')).toContainText('Không đọc được SGF');
  expect(await page.evaluate(() => window.__xv.Ana.games.length)).toBe(2);
  expect(errors).toEqual([]);
});

test('cờ vây Ván đã lưu: phân tích cả ván bằng KataGo – biểu đồ, đánh dấu nước hỏng, nước đề nghị, lưu lại sau khi tải lại trang', async ({ page }) => {
  const errors = await openGo(page);
  await page.click('.tab[data-tab="ana"]');
  // Trắng bỏ lượt vô cớ ở nước 4 khi đang ngang ngửa: phải bị đánh dấu ??
  await page.fill('#ana-paste', '(;GM[1]SZ[9]KM[7.5];B[ee];W[gc];B[cg];W[tt];B[gg];W[cc];B[dc];W[aa];B[cd];W[bb];B[ge])');
  await page.click('#ana-imp-text');
  await expect(page.locator('#ana-info')).toContainText('Nước 11/11');
  await page.click('#ana-full');
  await expect(page.locator('#ana-full')).toHaveText('Phân tích lại cả ván', { timeout: 90_000 });
  await expect(page.locator('#ana-graph svg polyline')).toHaveCount(1);
  await expect(page.locator('#ana-moves .mv[data-i="3"]')).toHaveText('Bỏ lượt??');
  await expect(page.locator('#ana-full-text')).toContainText('Trắng: 2 nước hỏng');
  await page.locator('#ana-mist .pz[data-k="3"]').click();
  await expect(page.locator('#ana-info')).toContainText('Nước 3/11');
  await expect(page.locator('#ana-note')).toContainText('Nước tiếp theo 4. Trắng Bỏ lượt là nước hỏng');
  await expect(page.locator('#ana-board .hintg')).toHaveCount(1);
  // Bấm vào đầu biểu đồ: về thế 0
  await page.locator('#ana-graph').scrollIntoViewIfNeeded();
  const box = await page.locator('#ana-graph').boundingBox();
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  await expect(page.locator('#ana-info')).toContainText('Nước 0/11');
  // Lưu cùng ván: tải lại trang vẫn còn, không phải phân tích lại
  await page.reload();
  await page.waitForFunction(() => window.__xv && window.__xv.Ana);
  await page.click('.tab[data-tab="ana"]');
  await page.locator('#ana-list .pz').first().click();
  await expect(page.locator('#ana-full')).toHaveText('Phân tích lại cả ván');
  await expect(page.locator('#ana-moves .mk2')).toHaveCount(2);
  // Dữ liệu phân tích hỏng (ví dụ từ tệp sao lưu bị sửa) thì bỏ qua, không vẽ
  await page.evaluate(() => { const A = window.__xv.Ana; A.games[0].ana.b[2] = '<img>'; A.open(A.games[0].id); });
  await expect(page.locator('#ana-full')).toHaveText('Phân tích cả ván (KataGo)');
  await expect(page.locator('#ana-graph')).toBeHidden();
  expect(errors).toEqual([]);
});

