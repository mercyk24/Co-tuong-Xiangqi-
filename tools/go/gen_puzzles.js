#!/usr/bin/env node
// [CỜ VÂY] Sinh bài "Bắt quân" cho tab Bắt quân của app cờ vây: data/go/puzzles.json. Sơ đồ: docs/CAU-TRUC.md
// Cách làm: tạo thế cờ 9×9 ngẫu nhiên (10–36 nước hợp lệ, phần lớn đặt gần nước trước cho giống thế giao chiến), tìm nhóm quân của bên KHÔNG đi mà bên đi bắt được;
// dùng bộ giải của lõi (GO.captureLength, GO.captureMoves) để biết số nước ít nhất. Chỉ giữ bài có ít đáp án đầu (≤ 2 với bài
// từ 2 nước), bỏ thế trùng (kể cả xoay, lật bàn), chia đều theo số nước.
// Chạy: node tools/go/gen_puzzles.js [hạt giống] [hạn mức "1:40,2:70,3:70,4:50,5:30"] [tệp ra]
'use strict';
const fs = require('fs');
const path = require('path');
const GO = require('../../src/go/core/go.js');

const seed = +(process.argv[2] || 20261126);
const quota = Object.fromEntries((process.argv[3] || '1:40,2:70,3:70,4:50,5:30').split(',').map(x => x.split(':').map(Number)));
const out = process.argv[4] || path.join(__dirname, '..', '..', 'data', 'go', 'puzzles.json');
let s = seed >>> 0;
const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const N = 9;

// 8 phép đối xứng của bàn: dùng để nhận ra thế trùng
function variants(fen) {
  const t = fen.split(' '), rows = t[3].split('/');
  const at = (r, c) => rows[r][c], out = [];
  for (let k = 0; k < 8; k++) {
    const R = [];
    for (let r = 0; r < N; r++) {
      let line = '';
      for (let c = 0; c < N; c++) {
        let rr = r, cc = c;
        if (k & 1) cc = N - 1 - cc;
        if (k & 2) rr = N - 1 - rr;
        if (k & 4) { const x = rr; rr = cc; cc = x; }
        line += at(rr, cc);
      }
      R.push(line);
    }
    out.push(t[1] + ' ' + R.join('/'));
  }
  return out.sort()[0];
}

function randomPos() {
  const p = GO.Pos.fromFen(GO.emptyFen(N));
  const moves = 10 + ((rnd() * 27) | 0);
  let last = -1;
  for (let k = 0; k < moves; k++) {
    for (let tries = 0; tries < 30; tries++) {
      // 3/4 số nước đặt gần nước trước (cách tối đa 2 đường) để có thế "giao chiến" giống ván thật, còn lại đặt bất kỳ
      let q = (rnd() * N * N) | 0;
      if (last >= 0 && rnd() < 0.75) {
        const r = Math.min(N - 1, Math.max(0, ((last / N) | 0) + ((rnd() * 5) | 0) - 2)), c = Math.min(N - 1, Math.max(0, (last % N) + ((rnd() * 5) | 0) - 2));
        q = r * N + c;
      }
      if (p.at(q) >= 0) continue;
      if (p.isEye(p.idx(q), p.side ? 2 : 1)) continue;
      if (p.isLegal(q + 1)) { p.make(q + 1); last = q; break; }
    }
  }
  return GO.Pos.fromFen(p.fen());   // bỏ lịch sử: bài bắt đầu từ thế này
}

const got = {}, seen = new Set(), list = [];
for (const k of Object.keys(quota)) got[k] = 0;
const need = () => Object.keys(quota).some(k => got[k] < quota[k]);
let tries = 0;
const t0 = Date.now();
while (need() && tries < 200000) {
  tries++;
  const pos = randomPos(), me = pos.side, seenG = new Set();
  for (let q = 0; q < N * N; q++) {
    if (pos.at(q) !== (me ^ 1) || seenG.has(q)) continue;
    const g = pos.group(pos.idx(q)).stones.map(i => pos.pt(i));
    g.forEach(x => seenG.add(x));
    if (g.length > 8) continue;
    const libs = pos.libsOf(pos.idx(q)).length;
    if (libs > 3) continue;
    const L = GO.captureLength(pos, q, 5, 120000);
    if (L < 1 || !quota[L] || got[L] >= quota[L]) continue;
    const first = GO.captureMoves(pos, q, L, 400000);
    if (!first || !first.length || (L >= 2 && first.length > 2)) continue;
    // Bên đi không có nhóm nào đang bị "atari" (để bài chỉ có một việc là bắt quân)
    let mine = false;
    for (let r = 0; r < N * N && !mine; r++) if (pos.at(r) === me && pos.libsOf(pos.idx(r)).length === 1) mine = true;
    if (mine) continue;
    const key = variants(pos.fen());
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ fen: pos.fen(), t: q, n: L, first: first.length });
    got[L]++;
    break;   // mỗi thế cờ một bài
  }
  if (tries % 2000 === 0) process.stderr.write('\r' + tries + ' thế, ' + JSON.stringify(got) + ' · ' + ((Date.now() - t0) / 1000).toFixed(0) + 's ');
}
process.stderr.write('\n');
list.sort((a, b) => a.n - b.n);
const res = list.map((p, i) => ({ id: i + 1, fen: p.fen, t: p.t, n: p.n }));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, '[\n' + res.map(x => JSON.stringify(x)).join(',\n') + '\n]\n');
console.log('Đã ghi ' + res.length + ' bài vào ' + out + ': ' + JSON.stringify(got) + ' (' + tries + ' thế thử)');
