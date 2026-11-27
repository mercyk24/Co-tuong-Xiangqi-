#!/usr/bin/env node
// [CỜ VÂY] Đổi mạng nơ-ron KataGo (.bin.gz, đời g170, phiên bản mô hình 8) sang tệp gọn cho app: các lớp chuẩn hoá (batch norm)
// đã gộp sẵn vào trọng số tích chập / nhân ma trận, trọng số lưu dạng số thực 16 bit (một nửa dung lượng), kèm phần mô tả JSON.
// Chạy: node tools/go/kata_convert.js <mạng.bin.gz> <tệp ra.kgo> [--f32]
// Định dạng ra: "KGO1" · uint32 độ dài JSON · JSON · đệm tới bội số 4 · dữ liệu (float16 hoặc float32, little-endian).
// JSON: { name, version, inC, gC, dtype, trunk: {...}, policy: {...}, value: {...}, t: { tên: [vị trí, số phần tử, ...shape] } }
// Cách chạy mạng: src/go/core/kata.js. Tài liệu: docs/DU-LIEU-CO-VAY.md.
// Cách đọc tệp .bin.gz theo KataGo (cpp/neuralnet/desc.cpp): Copyright 2025 David J Wu ("lightvector") and/or other authors
// of KataGo, giấy phép MIT (toàn văn trong tệp NOTICE).
'use strict';
const fs = require('fs');
const zlib = require('zlib');

const [, , inFile, outFile, flag] = process.argv;
if (!inFile || !outFile) { console.error('Dùng: node tools/go/kata_convert.js <mạng.bin.gz> <tệp ra.kgo> [--f32]'); process.exit(2); }
const F32 = flag === '--f32';
const buf = zlib.gunzipSync(fs.readFileSync(inFile));

// ---- Đọc định dạng KataGo: chữ cách nhau bởi khoảng trắng; khối số thực bắt đầu bằng "@BIN@"
let pos = 0;
const isWs = c => c === 32 || c === 10 || c === 13 || c === 9;
function tok() {
  while (pos < buf.length && isWs(buf[pos])) pos++;
  const s = pos;
  while (pos < buf.length && !isWs(buf[pos])) pos++;
  return buf.toString('latin1', s, pos);
}
const num = () => { const t = tok(); const v = Number(t); if (!isFinite(v)) throw new Error('Không phải số: ' + t + ' ở byte ' + pos); return v; };
function floats(n) {
  while (buf[pos] !== 64) { if (!isWs(buf[pos])) throw new Error('Thiếu @BIN@ ở byte ' + pos); pos++; }
  if (buf.toString('latin1', pos, pos + 5) !== '@BIN@') throw new Error('Sai đầu khối số ở byte ' + pos);
  pos += 5;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readFloatLE(pos + i * 4);
  pos += n * 4;
  return out;
}
function conv() {
  const name = tok(), h = num(), w = num(), ic = num(), oc = num(), dy = num(), dx = num();
  if (dy !== 1 || dx !== 1) throw new Error(name + ': chưa hỗ trợ tích chập giãn');
  return { name, h, w, ic, oc, W: floats(h * w * ic * oc) };   // thứ tự y, x, ic, oc (giống bộ lọc HWIO của TensorFlow)
}
function bn() {
  const name = tok(), c = num(), eps = num(), hasScale = num(), hasBias = num();
  const mean = floats(c), variance = floats(c);
  const scale = hasScale ? floats(c) : new Float32Array(c).fill(1), bias = hasBias ? floats(c) : new Float32Array(c);
  const s = new Float32Array(c), b = new Float32Array(c);
  for (let i = 0; i < c; i++) { s[i] = scale[i] / Math.sqrt(variance[i] + eps); b[i] = bias[i] - s[i] * mean[i]; }
  return { name, c, s, b };
}
const act = () => { tok(); };   // phiên bản 8: luôn là ReLU, chỉ có tên
function matmul() { const name = tok(), ic = num(), oc = num(); return { name, ic, oc, W: floats(ic * oc) }; }   // thứ tự ic, oc
function matbias() { const name = tok(), c = num(); return { name, c, W: floats(c) }; }
// Nhân từng kênh ra (cột cuối) của trọng số với hệ số chuẩn hoá
function scaleOut(W, oc, s) { const o = new Float32Array(W.length); for (let i = 0; i < W.length; i++) o[i] = W[i] * s[i % oc]; return o; }

const name = tok(), version = num(), inC = num(), gC = num();
if (version !== 8) throw new Error('Chỉ hỗ trợ mô hình phiên bản 8 (đời g170), tệp này là ' + version);

const T = {};   // tensor ra
const put = (key, data, shape) => { T[key] = { data, shape }; };
// ---- Thân mạng
tok(); const numBlocks = num(), trunkC = num(), midC = num(), regC = num(); num(); const gpC = num();
void midC;
const c1 = conv(); put('init.conv', c1.W, [c1.h, c1.w, c1.ic, c1.oc]);
const m1 = matmul(); put('init.mul', m1.W, [m1.ic, m1.oc]);
const blocks = [];
for (let i = 0; i < numBlocks; i++) {
  const kind = tok(), p = 'b' + i + '.';
  if (kind === 'ordinary_block') {
    tok(); const pre = bn(); act(); const cv1 = conv(); const mid = bn(); act(); const cv2 = conv();
    put(p + 'pre.s', pre.s, [pre.c]); put(p + 'pre.b', pre.b, [pre.c]);
    put(p + 'c1', scaleOut(cv1.W, cv1.oc, mid.s), [cv1.h, cv1.w, cv1.ic, cv1.oc]); put(p + 'c1.b', mid.b, [mid.c]);
    put(p + 'c2', cv2.W, [cv2.h, cv2.w, cv2.ic, cv2.oc]);
    blocks.push('o');
  } else if (kind === 'gpool_block') {
    tok(); const pre = bn(); act(); const reg = conv(); const gcv = conv(); const gbn = bn(); act(); const g2b = matmul(); const mid = bn(); act(); const cv2 = conv();
    put(p + 'pre.s', pre.s, [pre.c]); put(p + 'pre.b', pre.b, [pre.c]);
    put(p + 'reg', scaleOut(reg.W, reg.oc, mid.s), [reg.h, reg.w, reg.ic, reg.oc]);
    put(p + 'g', scaleOut(gcv.W, gcv.oc, gbn.s), [gcv.h, gcv.w, gcv.ic, gcv.oc]); put(p + 'g.b', gbn.b, [gbn.c]);
    put(p + 'g2b', scaleOut(g2b.W, g2b.oc, mid.s), [g2b.ic, g2b.oc]); put(p + 'mid.b', mid.b, [mid.c]);
    put(p + 'c2', cv2.W, [cv2.h, cv2.w, cv2.ic, cv2.oc]);
    blocks.push('g');
  } else throw new Error('Không biết loại khối: ' + kind);
}
const tip = bn(); act(); put('tip.s', tip.s, [tip.c]); put('tip.b', tip.b, [tip.c]);
// ---- Đầu ra nước đi (policy)
tok();
const p1 = conv(), g1 = conv(), g1bn = bn(); act(); const gb = matmul(); const p1bn = bn(); act(); const p2 = conv(); const pass = matmul();
put('p.p1', scaleOut(p1.W, p1.oc, p1bn.s), [p1.h, p1.w, p1.ic, p1.oc]); put('p.p1.b', p1bn.b, [p1bn.c]);
put('p.g1', scaleOut(g1.W, g1.oc, g1bn.s), [g1.h, g1.w, g1.ic, g1.oc]); put('p.g1.b', g1bn.b, [g1bn.c]);
put('p.gb', scaleOut(gb.W, gb.oc, p1bn.s), [gb.ic, gb.oc]);
put('p.p2', p2.W, [p2.h, p2.w, p2.ic, p2.oc]); put('p.pass', pass.W, [pass.ic, pass.oc]);
// ---- Đầu ra thế cờ (value, điểm, chủ đất)
tok();
const v1 = conv(), v1bn = bn(); act(); const v2 = matmul(), v2b = matbias(); act(); const v3 = matmul(), v3b = matbias(), sv3 = matmul(), sv3b = matbias(), own = conv();
put('v.v1', scaleOut(v1.W, v1.oc, v1bn.s), [v1.h, v1.w, v1.ic, v1.oc]); put('v.v1.b', v1bn.b, [v1bn.c]);
put('v.v2', v2.W, [v2.ic, v2.oc]); put('v.v2.b', v2b.W, [v2b.c]);
put('v.v3', v3.W, [v3.ic, v3.oc]); put('v.v3.b', v3b.W, [v3b.c]);
put('v.sv3', sv3.W, [sv3.ic, sv3.oc]); put('v.sv3.b', sv3b.W, [sv3b.c]);
put('v.own', own.W, [own.h, own.w, own.ic, own.oc]);
while (pos < buf.length && isWs(buf[pos])) pos++;
if (pos !== buf.length) throw new Error('Còn thừa ' + (buf.length - pos) + ' byte sau phần đầu ra thế cờ');

// ---- Ghi tệp
function toHalf(f) {   // float32 -> float16 (làm tròn về số gần nhất)
  const b = new Float32Array([f]), u = new Uint32Array(b.buffer)[0];
  const s = (u >>> 16) & 0x8000, e = ((u >>> 23) & 0xff) - 127 + 15; let m = u & 0x7fffff;
  if (e <= 0) { if (e < -10) return s; m |= 0x800000; const sh = 14 - e; let h = m >> sh; if ((m >> (sh - 1)) & 1) h++; return s | h; }
  if (e >= 31) return s | 0x7c00;
  let h = s | (e << 10) | (m >> 13); if (m & 0x1000) h++; return h;
}
const meta = { name, version, inC, gC, dtype: F32 ? 'f32' : 'f16', trunkC, regC, gpC, blocks, t: {} };
let total = 0;
for (const k of Object.keys(T)) { meta.t[k] = [total, T[k].data.length].concat(T[k].shape); total += T[k].data.length; }
const json = Buffer.from(JSON.stringify(meta), 'utf8');
const head = 8 + json.length, pad = (4 - head % 4) % 4;
const data = Buffer.alloc(total * (F32 ? 4 : 2));
let o = 0;
for (const k of Object.keys(T)) for (const v of T[k].data) { if (F32) data.writeFloatLE(v, o * 4); else data.writeUInt16LE(toHalf(v), o * 2); o++; }
const hdr = Buffer.alloc(8); hdr.write('KGO1', 0, 'latin1'); hdr.writeUInt32LE(json.length, 4);
fs.writeFileSync(outFile, Buffer.concat([hdr, json, Buffer.alloc(pad), data]));
console.log('Đã đổi ' + name + ' (' + numBlocks + ' khối, ' + trunkC + ' kênh, khối gpool: ' + blocks.map((b, i) => b === 'g' ? i : '').filter(String).join(',') + '): ' +
  total + ' trọng số, ' + (fs.statSync(outFile).size / 1048576).toFixed(2) + ' MB -> ' + outFile);
