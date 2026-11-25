#!/usr/bin/env node
// Dựng bản phát hành vào thư mục dist/:
//   - ghép các module trong src/app/ thành một khối (bọc trong một hàm, 'use strict'), ghi kèm .build/app.js để kiểm tra lỗi mã;
//   - nhúng lõi luật cờ, dữ liệu và mã app vào src/index.template.html thành dist/index.html (một file, chạy được ngoại tuyến);
//   - chép tài nguyên (icon, manifest, service worker) và engine mạnh (engine/) sang dist/;
//   - tự điền số phiên bản và tên cache cho service worker (theo mã băm nội dung), nên không phải sửa tay khi cập nhật.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const r = (...p) => path.join(ROOT, ...p);
const read = p => fs.readFileSync(r(p), 'utf8').replace(/^﻿/, '');
const pkg = JSON.parse(read('package.json'));

function bundleApp() {
  const dir = r('src', 'app');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
  const parts = files.map(f => '// ==== src/app/' + f + ' ====\n' + read(path.join('src', 'app', f)).replace(/\s+$/, '') + '\n');
  return '/* Cờ Tướng Luyện Tập ' + pkg.version + ' – mã giao diện (tự sinh từ src/app/, đừng sửa trực tiếp) */\n' +
    '(function () {\n  \'use strict\';\n' + parts.join('\n') + '})();\n';
}

function checkInline(name, s) {
  if (/<\/script/i.test(s)) throw new Error(name + ' chứa chuỗi "</script", không nhúng vào HTML được');
}

function jsonData(name, fallback) {
  const p = r('data', name);
  if (!fs.existsSync(p)) { if (fallback !== undefined) return fallback; throw new Error('Thiếu data/' + name); }
  const s = fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
  JSON.parse(s); // báo lỗi sớm nếu file hỏng
  return s;
}

function copyDir(from, to, filter) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    if (filter && !filter(f)) continue;
    const src = path.join(from, f);
    if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(to, f));
  }
}

// Chính sách nội dung (CSP): chỉ chạy đúng các đoạn mã nhúng sẵn trong trang (theo mã băm) và tệp cùng nguồn,
// chỉ kết nối tới điểm hẹn của app. Kẻ xấu có chèn được chữ vào trang cũng không chạy được mã lạ hay gửi dữ liệu đi nơi khác.
//   'wasm-unsafe-eval': cho engine WebAssembly (không mở eval cho JavaScript)
//   blob: cho engine tự viết chạy trong Web Worker (mã lấy từ chính trang)
//   ws://localhost, ws://127.0.0.1: điểm hẹn chạy thử trên máy khi kiểm tra
const CONNECT = ["'self'", 'wss://co-tuong.cotuong-mercy.workers.dev', 'wss://0.peerjs.com', 'ws://localhost:*', 'ws://127.0.0.1:*'];
function cspFor(html) {
  const hashes = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) hashes.push("'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
  if (!hashes.length) throw new Error('Không tìm thấy mã nhúng để tính CSP');
  if (/\son[a-z]+=/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''))) {
    throw new Error('Mẫu HTML có thuộc tính sự kiện (onclick=…); CSP sẽ chặn, hãy gắn sự kiện trong mã');
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' " + hashes.join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    'connect-src ' + CONNECT.join(' '),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ');
}
// Tiêu đề cho bản trang trên Cloudflare (GitHub Pages bỏ qua tệp này; ở đó service worker tự thêm các tiêu đề chính).
function headersFile(csp) {
  return [
    '/*',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Cross-Origin-Embedder-Policy: require-corp',
    '  Cross-Origin-Resource-Policy: same-origin',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    '/',
    '  Content-Security-Policy: ' + csp + "; frame-ancestors 'none'",
    '  X-Frame-Options: DENY',
    '/index.html',
    '  Content-Security-Policy: ' + csp + "; frame-ancestors 'none'",
    '  X-Frame-Options: DENY',
    ''
  ].join('\n');
}

function main() {
  const dist = r('dist');
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  fs.mkdirSync(r('.build'), { recursive: true });

  const core = read('src/core/xq.js');
  const app = bundleApp();
  fs.writeFileSync(r('.build', 'app.js'), app);
  const blocks = {
    '/*__CORE__*/': core,
    '/*__PUZZLES__*/': jsonData('puzzles.json'),
    '/*__OPENINGS__*/': jsonData('openings.json'),
    '/*__TACTICS__*/': jsonData('tactics.json', '[]'),
    '/*__BOOK__*/': jsonData('book.json', '{}'),
    '/*__APP__*/': app
  };
  let html = read('src/index.template.html');
  for (const [key, val] of Object.entries(blocks)) {
    checkInline(key, val);
    if (html.indexOf(key) < 0) throw new Error('Mẫu HTML thiếu chỗ nhúng ' + key);
    html = html.split(key).join(val);
  }
  html = html.split('__VERSION__').join(pkg.version);
  const hash = crypto.createHash('sha256').update(html).digest('hex').slice(0, 10);
  const date = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);
  html = html.split('__BUILD_DATE__').join(date);
  const csp = cspFor(html);
  html = html.replace('<!--__CSP__-->', '<meta http-equiv="Content-Security-Policy" content="' + csp + '">');
  fs.writeFileSync(path.join(dist, 'index.html'), html);

  copyDir(r('src', 'assets'), dist);
  const swPath = path.join(dist, 'sw.js');
  const sw = fs.readFileSync(swPath, 'utf8');
  if (sw.indexOf('__CACHE__') < 0) throw new Error('sw.js thiếu chỗ điền __CACHE__');
  if (sw.indexOf('__CSP__') < 0) throw new Error('sw.js thiếu chỗ điền __CSP__');
  fs.writeFileSync(swPath, sw.split('__CACHE__').join('xq-' + pkg.version + '-' + hash).split("'__CSP__'").join(JSON.stringify(csp)));

  const eng = r('engine');
  if (fs.existsSync(eng)) copyDir(eng, path.join(dist, 'engine'), f => !/\.md$/i.test(f) && f !== 'SHA256SUMS');
  else console.warn('Cảnh báo: không có thư mục engine/, cấp 6 và phân tích ván sẽ không chạy.');
  fs.writeFileSync(path.join(dist, '.nojekyll'), '');
  // Tiêu đề cho bản trang chạy trên Cloudflare (wrangler.jsonc). GitHub Pages bỏ qua tệp này; ở đó service worker tự thêm.
  fs.writeFileSync(path.join(dist, '_headers'), headersFile(csp));
  fs.writeFileSync(r('.build', 'csp.txt'), csp + '\n');

  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log('Đã dựng ' + pkg.name + ' ' + pkg.version + ' (' + date + ', ' + hash + '): index.html ' + kb(Buffer.byteLength(html)));
}

try { main(); } catch (e) { console.error('Lỗi khi dựng: ' + e.message); process.exit(1); }
