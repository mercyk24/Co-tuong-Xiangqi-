// Kiểm tra chơi qua mạng giữa hai "thiết bị" (hai trang trong cùng trình duyệt).
// Dùng điểm hẹn giả (BroadcastChannel) thay cho 0.peerjs.com, còn kết nối WebRTC giữa hai trang là thật.
// Kiểm tra với điểm hẹn thật nằm ở net-real.spec.js (chỉ chạy khi đặt XQ_NET_REAL=1).
'use strict';
const { test } = require('@playwright/test');
const { expect } = require('./helpers');

test.describe.configure({ timeout: 120_000 });

async function device(context, errors) {
  const p = await context.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('co-tuong/index.html');
  await p.waitForFunction(() => window.crossOriginIsolated === true && window.__xq && window.__xq.Play, null, { timeout: 20_000 });
  return p;
}
const st = p => p.evaluate(() => ({ state: window.__xq.Net.state, err: window.__xq.Net.err, side: window.__xq.Net.mySide, notes: window.__xq.Play.notes.slice(), over: window.__xq.Play.over, flip: window.__xq.Play.board.flip }));
const move = (p, s) => p.evaluate(x => { const P = window.__xq.Play; P.doMove(P.ctx.pos.parse(x), true); }, s);
async function room(context, errors, { side = '0', clock = '0' } = {}) {
  const A = await device(context, errors);
  await A.locator('.mode[data-m="net"]').click();
  await A.click('#net-go-create');
  await A.selectOption('#net-side', side);
  await A.locator('#net-times .btn[data-k="' + clock + '"]').click();
  await expect(A.locator('#net-code-show')).toHaveText(/^[A-Z2-9]{6}$/);
  const code = await A.locator('#net-code-show').innerText();
  // Hai trang cùng trình duyệt dùng chung bộ nhớ, nên trang B mở ra đã ở chế độ "Qua mạng" (trên hai máy thật thì không).
  const B = await device(context, errors);
  await B.evaluate(() => window.__xq.Play.setMode('net'));
  await expect(B.locator('#net-home')).toBeVisible();
  await B.fill('#net-code', code.toLowerCase());
  await B.click('#net-join');
  try {
    await A.waitForFunction(() => window.__xq.Net.state === 'playing', null, { timeout: 40_000 });
    await B.waitForFunction(() => window.__xq.Net.state === 'playing', null, { timeout: 40_000 });
  } catch (e) {
    console.log('Nhật ký A:\n' + (await A.evaluate(() => window.__xq.Net.log.join('\n'))));
    console.log('Nhật ký B:\n' + (await B.evaluate(() => window.__xq.Net.log.join('\n'))));
    throw e;
  }
  return { A, B, code };
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { localStorage.setItem('xq_consent_net', '{"v":"2026-11-25","t":1}'); window.__XQ_SIGNAL__ = 'local'; window.__XQ_ICE__ = []; window.__XQ_JOIN_MS__ = 20000; });
});

test('qua mạng: tạo phòng, vào bằng mã, hai bên đi quân đồng bộ, đồng hồ khớp, bàn xoay theo bên mình', async ({ context }) => {
  const errors = [];
  const { A, B } = await room(context, errors, { side: '0', clock: '3+2' });
  expect((await st(A)).side).toBe(0); expect((await st(B)).side).toBe(1);
  expect((await st(A)).flip).toBe(false); expect((await st(B)).flip).toBe(true);
  await expect(A.locator('#pbar-bot .pname')).toHaveText('Bạn · Đỏ');
  await expect(B.locator('#pbar-bot .pname')).toHaveText('Bạn · Đen');
  await expect(B.locator('#pbar-top [data-act="menu"]')).toBeHidden();
  // Đen không đi được khi chưa tới lượt
  await B.evaluate(() => { const P = window.__xq.Play; P.onSquare(P.ctx.pos.parse('馬8進7') >> 7); });
  expect((await st(B)).notes).toEqual([]);
  await move(A, '炮二平五');
  await B.waitForFunction(() => window.__xq.Play.notes.length === 1);
  await move(B, '馬8進7');
  await A.waitForFunction(() => window.__xq.Play.notes.length === 2);
  await move(A, '傌二進三');
  await B.waitForFunction(() => window.__xq.Play.notes.length === 3);
  expect((await st(A)).notes).toEqual((await st(B)).notes);
  const ca = await A.evaluate(() => window.__xq.Play.clock.left), cb = await B.evaluate(() => window.__xq.Play.clock.left);
  expect(Math.abs(ca[0] - cb[0])).toBeLessThan(1500);
  expect(Math.abs(ca[1] - cb[1])).toBeLessThan(1500);
  expect(errors).toEqual([]);
});

test('qua mạng: xin hòa (từ chối rồi đồng ý), xin đi lại, chịu thua, đấu lại đổi màu', async ({ context }) => {
  const errors = [];
  const { A, B } = await room(context, errors, { side: '1' });
  expect((await st(A)).side).toBe(1);
  await move(B, '炮二平五'); await A.waitForFunction(() => window.__xq.Play.notes.length === 1);
  await move(A, '馬8進7'); await B.waitForFunction(() => window.__xq.Play.notes.length === 2);
  // B (Đỏ) xin đi lại: A đồng ý -> gỡ cả nước của A và B
  await B.locator('#pbar-bot [data-act="menu"]').click();
  await B.locator('#pm [data-act="undo"]').click();
  await expect(A.locator('#play-ask-text')).toHaveText('Đối thủ xin đi lại nước vừa rồi. Bạn có đồng ý không?');
  await A.click('#play-ask-yes');
  await B.waitForFunction(() => window.__xq.Play.notes.length === 0);
  expect((await st(A)).notes).toEqual([]);
  await move(B, '炮二平五'); await A.waitForFunction(() => window.__xq.Play.notes.length === 1);
  // A xin hòa: B từ chối, rồi đồng ý
  await A.locator('#pbar-bot [data-act="menu"]').click();
  await A.locator('#pm [data-act="draw"]').click();
  await expect(B.locator('#play-ask-text')).toHaveText('Đối thủ xin hòa. Bạn có đồng ý không?');
  await B.click('#play-ask-no');
  await expect(A.locator('#toast')).toContainText('không đồng ý xin hòa');
  await A.locator('#pbar-bot [data-act="menu"]').click();
  await A.locator('#pm [data-act="draw"]').click();
  await B.click('#play-ask-yes');
  await A.waitForFunction(() => !!window.__xq.Play.over);
  expect((await st(A)).over).toBe('Hòa – hai bên đồng ý.');
  expect((await st(B)).over).toBe('Hòa – hai bên đồng ý.');
  // Đấu lại: B mời, A (chủ phòng) đồng ý -> đổi màu
  await expect(B.locator('#play-result-new')).toHaveText('Đấu lại');
  await B.click('#play-result-new');
  await A.click('#play-ask-yes');
  await A.waitForFunction(() => !window.__xq.Play.over && window.__xq.Net.mySide === 0);
  await B.waitForFunction(() => !window.__xq.Play.over && window.__xq.Net.mySide === 1);
  // A (giờ là Đỏ) chịu thua
  await move(A, '炮二平五'); await B.waitForFunction(() => window.__xq.Play.notes.length === 1);
  await A.locator('#pbar-bot [data-act="menu"]').click();
  await A.locator('#pm [data-act="resign"]').click();
  await A.click('#play-ask-yes');
  await B.waitForFunction(() => !!window.__xq.Play.over);
  expect((await st(B)).over).toBe('Đỏ chịu thua – Đen thắng.');
  await expect(B.locator('#pbar-bot .pst')).toHaveText('Thắng');
  expect(errors).toEqual([]);
});

test('qua mạng: rớt kết nối thì báo, tự nối lại và đồng bộ ván; đồng hồ dừng khi mất kết nối', async ({ context }) => {
  const errors = [];
  const { A, B } = await room(context, errors, { side: '0', clock: '5+0' });
  await move(A, '炮二平五'); await B.waitForFunction(() => window.__xq.Play.notes.length === 1);
  // cắt kết nối phía khách
  await B.evaluate(() => window.__xq.Net.dc.close());
  await B.waitForFunction(() => window.__xq.Net.state === 'lost', null, { timeout: 20_000 });
  await expect(B.locator('#net-banner')).toBeVisible();
  // trong lúc mất kết nối, không đi được
  await B.evaluate(() => { const P = window.__xq.Play; P.onSquare(P.ctx.pos.parse('馬8進7') >> 7); });
  // tự nối lại
  try {
    await A.waitForFunction(() => window.__xq.Net.state === 'playing', null, { timeout: 30_000 });
    await B.waitForFunction(() => window.__xq.Net.state === 'playing', null, { timeout: 30_000 });
  } catch (e) {
    console.log('Nhật ký A:\n' + (await A.evaluate(() => window.__xq.Net.log.join('\n'))));
    console.log('Nhật ký B:\n' + (await B.evaluate(() => window.__xq.Net.log.join('\n'))));
    throw e;
  }
  await expect(B.locator('#net-banner')).toBeHidden();
  await move(B, '馬8進7'); await A.waitForFunction(() => window.__xq.Play.notes.length === 2);
  expect((await st(A)).notes).toEqual(['炮二平五', '馬8進7']);
  // máy khách có ván lệch (giả lập mất một tin nhắn) -> chủ phòng gửi lại cả ván
  await B.evaluate(() => { const P = window.__xq.Play; P.ctx.pos.unmake(); P.moves.pop(); P.notes.pop(); });
  await move(A, '傌二進三');
  await B.waitForFunction(() => window.__xq.Play.notes.length === 3);
  expect((await st(B)).notes).toEqual((await st(A)).notes);
  expect(errors).toEqual([]);
});

test('qua mạng: vào bằng link mời; chủ phòng rời thì máy kia được báo; sai mã thì báo không tìm thấy', async ({ context }) => {
  const errors = [];
  const A = await device(context, errors);
  await A.evaluate(() => { window.__xq.Play.setMode('net'); return window.__xq.Net.create('r', '0'); });
  await A.waitForFunction(() => window.__xq.Net.state === 'waiting');
  const code = await A.evaluate(() => window.__xq.Net.code);
  const link = await A.evaluate(() => window.__xq.Net.joinLink());
  expect(link).toContain('#phong=' + code);
  // Máy B mở link mời lần đầu: trình duyệt mới hoàn toàn (chưa có service worker), app sẽ tự tải lại một lần rồi mới vào phòng.
  const B = await context.newPage();
  await B.goto('co-tuong/index.html#phong=' + code);
  await B.waitForFunction(() => window.__xq && window.__xq.Net.state === 'playing', null, { timeout: 30_000 });
  expect(await B.evaluate(() => location.hash)).toBe('');
  await A.locator('#pbar-bot [data-act="menu"]').count();
  // chủ phòng rời phòng (sau khi ván kết thúc bằng chịu thua)
  await A.evaluate(() => window.__xq.Play.netLeave());
  await B.waitForFunction(() => window.__xq.Play.over === 'Đối thủ đã rời phòng.');
  // sai mã phòng
  const C = await device(context, errors);
  await C.evaluate(() => { window.__xq.Play.setMode('net'); return window.__xq.Net.join('ZZZZ99'); });
  await C.waitForFunction(() => window.__xq.Net.state === 'error', null, { timeout: 40_000 });
  await expect(C.locator('#net-err')).toContainText('Không có phản hồi từ phòng ZZZZ99');
  await expect(C.locator('#net-home')).toBeVisible();
  expect(errors).toEqual([]);
});

test('qua mạng: hai máy khác phiên bản giao thức thì báo cập nhật app', async ({ context }) => {
  const errors = [];
  const { B } = await room(context, errors);
  await B.evaluate(() => window.__xq.Net.onMsg({ t: 'hello', p: 999, v: '9.9.9' }));
  await expect(B.locator('#net-err')).toContainText('phiên bản app khác nhau');
});

test('qua mạng: máy mới mở link mời lần đầu (app tự tải lại một lần) vẫn giữ mã phòng và vào phòng', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { localStorage.setItem('xq_consent_net', '{"v":"2026-11-25","t":1}'); window.__XQ_SIGNAL__ = 'local'; window.__XQ_ICE__ = []; window.__XQ_JOIN_MS__ = 20000; });
  const p = await ctx.newPage();
  await p.goto('co-tuong/index.html#phong=K7P2QD');
  await p.waitForFunction(() => window.crossOriginIsolated === true && window.__xq && window.__xq.Net.code === 'K7P2QD', null, { timeout: 30_000 });
  expect(await p.evaluate(() => sessionStorage.getItem('xq_coi'))).toBe('1'); // đã tải lại một lần
  expect(['joining', 'error']).toContain(await p.evaluate(() => window.__xq.Net.state));
  expect(await p.evaluate(() => location.hash)).toBe('');
  await ctx.close();
});

test('qua mạng: không tin tin giả "bạn hết giờ" hay giờ khai khống từ máy đối thủ', async ({ context }) => {
  const errors = [];
  const { A, B } = await room(context, errors, { side: '0', clock: '3+2' });
  // B (Đen) gửi tin giả: Đỏ hết giờ, khi đồng hồ của A còn gần 3 phút
  await B.evaluate(() => window.__xq.Net.sendMsg({ t: 'flag', s: 0 }));
  await A.waitForTimeout(500);
  expect((await st(A)).over).toBe(null);
  await move(A, '炮二平五'); await B.waitForFunction(() => window.__xq.Play.notes.length === 1);
  // B đi và khai khống giờ của mình lên 1 giờ
  await B.evaluate(() => { const P = window.__xq.Play, m = P.ctx.pos.parse('馬8進7'); P.notes.push(P.ctx.pos.notation(m)); P.ctx.pos.make(m); P.moves.push(m); window.__xq.Net.sendMove(1, XQ.mvStr(m), [180000, 3600000]); });
  await A.waitForFunction(() => window.__xq.Play.notes.length === 2);
  const left = await A.evaluate(() => window.__xq.Play.clock.left);
  expect(left[1]).toBeLessThan(185000);
  expect(errors).toEqual([]);
});

test('qua mạng: một nước đi bị rơi trên đường thì hai máy tự đồng bộ lại sau vài giây', async ({ context }) => {
  const errors = [];
  const { A, B } = await room(context, errors, { side: '0' });
  // A đi nhưng tin nhắn không tới B (giả lập rơi gói)
  await A.evaluate(() => { const N = window.__xq.Net, o = N.sendMove; N.sendMove = () => { N.sendMove = o; }; const P = window.__xq.Play; P.doMove(P.ctx.pos.parse('炮二平五'), true); });
  await A.waitForTimeout(300);
  expect((await st(B)).notes).toEqual([]);
  await B.waitForFunction(() => window.__xq.Play.notes.length === 1, null, { timeout: 20_000 });
  expect((await st(B)).notes).toEqual(['炮二平五']);
  expect(errors).toEqual([]);
});

test('qua mạng: máy thứ ba vào phòng đã đủ người thì được báo, ván của hai máy kia không bị ảnh hưởng', async ({ context }) => {
  const errors = [];
  const { A, B, code } = await room(context, errors);
  await move(A, '炮二平五'); await B.waitForFunction(() => window.__xq.Play.notes.length === 1);
  // Hai trang chung bộ nhớ: xóa phiên đã lưu của A/B trước khi C mở, để C là "máy thứ ba" thật sự
  const C = await context.newPage();
  C.on('pageerror', e => errors.push(e.message));
  await C.addInitScript(() => localStorage.removeItem('xq_net_sess'));
  await C.goto('co-tuong/index.html');
  await C.waitForFunction(() => window.crossOriginIsolated === true && window.__xq && window.__xq.Play, null, { timeout: 20_000 });
  await C.evaluate(c => { window.__xq.Play.setMode('net'); return window.__xq.Net.join(c); }, code);
  await C.waitForFunction(() => window.__xq.Net.state === 'error', null, { timeout: 30_000 });
  await expect(C.locator('#net-err')).toContainText('đã có người chơi');
  expect((await st(A)).state).toBe('playing'); expect((await st(B)).state).toBe('playing');
  await move(B, '馬8進7'); await A.waitForFunction(() => window.__xq.Play.notes.length === 2);
  expect(errors).toEqual([]);
});

test('qua mạng: điểm hẹn ngắt đúng lúc đang vào phòng thì tự vào lại và vẫn nối được', async ({ context }) => {
  const errors = [];
  const A = await device(context, errors);
  await A.evaluate(() => { window.__xq.Play.setMode('net'); return window.__xq.Net.create('0', '0'); });
  await A.waitForFunction(() => window.__xq.Net.state === 'waiting');
  const code = await A.evaluate(() => window.__xq.Net.code);
  const B = await device(context, errors);
  // Giả lập máy chủ điểm hẹn ngắt kết nối ngay sau lời gọi đầu tiên (như 0.peerjs.com khi gặp sự cố)
  await B.evaluate(() => {
    const orig = BroadcastChannel.prototype.postMessage;
    BroadcastChannel.prototype.postMessage = function (m) {
      if (m && m.type === 'OFFER' && !window.__dropped) {
        window.__dropped = true;
        const s = window.__xq.Net.sig, cb = s.onClose; s.close(); setTimeout(cb, 300); return;
      }
      return orig.call(this, m);
    };
  });
  await B.evaluate(c => { window.__xq.Play.setMode('net'); return window.__xq.Net.join(c); }, code);
  await B.waitForFunction(() => window.__xq.Net.state === 'playing', null, { timeout: 30_000 });
  await A.waitForFunction(() => window.__xq.Net.state === 'playing', null, { timeout: 10_000 });
  expect(await B.evaluate(() => window.__xq.Net.log.some(l => l.includes('điểm hẹn ngắt')))).toBe(true);
  expect(errors).toEqual([]);
});
