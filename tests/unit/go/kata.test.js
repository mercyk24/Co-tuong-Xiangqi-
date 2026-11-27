// [CỜ VÂY] Kiểm tra KataGo chạy bằng TensorFlow.js (src/go/core/kata.js + engine/): đọc tệp mạng .kgo, đặc trưng đầu vào,
// so kết quả mạng với KataGo thật (tests/unit/go/kata-ref.json, tạo bằng lệnh kata-raw-nn của KataGo 1.18.1), thang, đếm đất Benson,
// quân chết theo ownership, tìm kiếm MCTS. Dùng bộ tính 'cpu' của tfjs (cùng phép tính với WebAssembly trong trình duyệt).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const GO = require('../../../src/go/core/go.js');
const KATA = require('../../../src/go/core/kata.js');
const ENGINE = path.join(__dirname, '../../../engine');

// Nạp bản UMD của tfjs giống trong Worker của trình duyệt (biến toàn cục tf)
function loadTf() {
  if (globalThis.tf && globalThis.tf.setBackend) return globalThis.tf;
  if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;   // bản UMD gắn tf vào self
  if (typeof globalThis.require === 'undefined') globalThis.require = require;   // tfjs dò môi trường Node bằng require
  for (const f of ['tf-core.min.js', 'tf-backend-cpu.min.js']) {
    const file = path.join(ENGINE, f);
    vm.runInThisContext('(function(exports,module,define){' + fs.readFileSync(file, 'utf8') + '\n})(undefined,undefined,undefined)', { filename: file });
  }
  return globalThis.tf;
}
let net = null;
async function getNet() {
  if (net) return net;
  const tf = loadTf();
  await tf.setBackend('cpu');
  const b = fs.readFileSync(path.join(ENGINE, 'kata-g170e-b10c128.kgo'));
  const model = KATA.decodeModel(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  net = new KATA.Net(tf, model);
  return net;
}
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'kata-ref.json'), 'utf8')).positions;
const posOf = r => { const p = GO.Pos.fromFen(GO.emptyFen(r.n, r.komi)); for (const s of r.moves) p.make(s.toLowerCase() === 'pass' ? GO.PASS : p.parse(s)); return p; };

test('tệp mạng .kgo: đầu tệp KGO1, mô hình bản 8, 10 khối (2 khối gộp toàn cục), kích thước đúng', async () => {
  const b = fs.readFileSync(path.join(ENGINE, 'kata-g170e-b10c128.kgo'));
  assert.equal(b.toString('latin1', 0, 4), 'KGO1');
  const m = KATA.decodeModel(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  assert.equal(m.meta.version, 8);
  assert.equal(m.meta.trunkC, 128);
  assert.equal(m.meta.blocks.length, 10);
  assert.deepEqual(m.meta.blocks.map((x, i) => x === 'g' ? i : -1).filter(i => i >= 0), [4, 7]);
  assert.equal(m.meta.inC, KATA.NF); assert.equal(m.meta.gC, KATA.NG);
});

test('mạng chạy bằng tfjs cho cùng kết quả với KataGo thật trên 8 thế (9×9, 13×13, 19×19, có bỏ lượt, komi 0)', async () => {
  const nn = await getNet();
  for (const [k, r] of REF.entries()) {
    const pos = posOf(r), A = r.n * r.n;
    const o = KATA.evaluate(nn, [pos])[0];
    assert.ok(Math.abs(o.whiteWin - r.whiteWin) < 0.005, '#' + k + ' tỉ lệ thắng ' + o.whiteWin + ' / ' + r.whiteWin);
    assert.ok(Math.abs(o.whiteLead - r.whiteLead) < 0.05, '#' + k + ' điểm hơn ' + o.whiteLead + ' / ' + r.whiteLead);
    let arg = 0; for (let p = 0; p < A; p++) if (o.policy[p] > o.policy[arg]) arg = p;
    assert.equal(pos.notation(arg + 1), r.top, '#' + k + ' nước tốt nhất');
    assert.ok(Math.abs(o.policy[arg] - r.topP) < 0.003, '#' + k + ' xác suất nước tốt nhất');
    let dov = 0; for (let p = 0; p < A; p++) dov = Math.max(dov, Math.abs(o.whiteOwnership[p] - r.own[p]));
    assert.ok(dov < 0.02, '#' + k + ' ownership lệch ' + dov);
  }
});

test('thang: quân hai khí bị đuổi thang ra hai hướng; chỉ chặn một hướng vẫn bị bắt, chặn cả hai hướng thì thoát', () => {
  const q = GO.Pos.fromFen(GO.emptyFen(19));
  for (const [s, c] of [['J10', 1], ['K11', 1], ['L9', 1], ['K10', 2]]) q.put(q.idx(q.pointOf(s)), c);   // 1 Đen, 2 Trắng
  const T = q.idx(q.pointOf('K10'));
  assert.equal(q.libsOf(T).length, 2);
  assert.equal(KATA.ladderCaptured(q, T, false), true);
  const withW = list => { const r = q.clone(); for (const s of list) r.put(r.idx(r.pointOf(s)), 2); return KATA.ladderCaptured(r, T, false); };
  assert.equal(withW(['F5']), true);
  assert.equal(withW(['O15']), true);
  assert.equal(withW(['F5', 'O15']), false);
  // đặc trưng thang trong đầu vào của mạng nằm trong khoảng 0..1
  const f = new Float32Array(361 * KATA.NF), g = new Float32Array(KATA.NG);
  KATA.features(q, f, 0, g, 0);
  for (let i = 0; i < f.length; i++) assert.ok(f[i] >= 0 && f[i] <= 1, 'đặc trưng ' + i + ' = ' + f[i]);
});

test('đếm đất Benson: nhóm Đen hai mắt thật là sống chắc, hai mắt tính là đất Đen; vùng giáp cả hai màu không của ai', () => {
  const B = rows => '9 b 7.5 ' + rows.join('/');
  const p = GO.Pos.fromFen(B(['.........', '.........', '......o..', '.........', '.........', '.........', '.........', 'xxxx.....', '.x.x.....']));
  const area = KATA.calculateArea(p), at = s => area[p.idx(p.pointOf(s))];
  assert.equal(at('A1'), 1); assert.equal(at('C1'), 1);   // 1 = Đen, 2 = Trắng
  assert.equal(at('G7'), 2);                               // quân Trắng
  assert.equal(at('E5'), 0);
});

test('quân chết theo ownership của KataGo: quân bị đánh dấu chết đều nằm trong đất đối phương; đếm điểm ra cùng bên thắng', async () => {
  const nn = await getNet();
  const r = REF[7], pos = posOf(r);   // ván 9×9 gần xong, Đen vừa bỏ lượt (KataGo: Trắng thắng, whiteWin ≈ 0,99)
  const o = KATA.evaluate(nn, [pos])[0];
  const dead = KATA.deadFromOwnership(pos, o.whiteOwnership);
  for (const p of dead) {
    const c = pos.at(p), own = o.whiteOwnership[p];
    assert.ok(c >= 0);
    assert.ok(c === 1 ? own < -0.4 : own > 0.4, 'quân chết phải nằm trong đất đối phương');
  }
  const s = pos.score(new Set(dead));
  assert.equal(s.winner, 1, 'Trắng thắng, như KataGo đánh giá');
});

test('tìm kiếm: 1 lần đọc = nước mạng chọn; đọc thêm thì chọn nước được thăm nhiều nhất, tỉ lệ thắng hợp lệ và luôn là nước đi được', async () => {
  const nn = await getNet();
  const S = new KATA.Search(nn);
  const pos = posOf(REF[1]);
  const r1 = S.search(pos, { visits: 1 });
  assert.equal(pos.notation(r1.move), REF[1].top);
  const r2 = S.search(pos, { visits: 16, timeMs: 120000 });
  assert.ok(r2.visits > 1 && r2.visits <= 16, 'số lần đọc ' + r2.visits);   // có thể dừng sớm khi nước dẫn đầu không thể bị vượt
  assert.ok(r2.top[0][1] > 0 && r2.top[0][0] === r2.move);
  assert.ok(r2.winrate >= 0 && r2.winrate <= 1);
  assert.ok(pos.isLegal(r2.move));
  // nhiệt độ: đi ngẫu nhiên trong các nước mạng thấy được, nhưng cùng seed thì giống nhau
  const a = S.search(pos, { visits: 1, temp: 1, seed: 7 }), b = S.search(pos, { visits: 1, temp: 1, seed: 7 });
  assert.equal(a.move, b.move); assert.ok(pos.isLegal(a.move));
});
