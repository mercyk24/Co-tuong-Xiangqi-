#!/usr/bin/env node
// Dựng bản phát hành vào thư mục dist/ gồm bốn trang:
//   dist/index.html            trang chủ: chọn loại cờ (src/portal/index.html)
//   dist/co-tuong/index.html   Cờ Tướng: src/xiangqi/ (lõi, module, giao diện) + src/shared/ + dữ liệu data/xiangqi/
//   dist/co-vua/index.html     Cờ Vua:   src/chess/   (lõi, module, giao diện) + src/shared/ + dữ liệu data/chess/
//   dist/co-vay/index.html     Cờ Vây:   src/go/      (lõi, module, giao diện) + src/shared/ (trừ các module trong `skip`) + data/go/
// Mỗi app: ghép module src/shared/app/ + src/<loại cờ>/app/ (theo số đầu tên tệp) thành một khối 'use strict', ghi kèm
// .build/<app>.js để kiểm tra lỗi mã; nhúng CSS (src/shared/base.css rồi src/<loại cờ>/game.css), lõi luật, dữ liệu và mã
// vào mẫu HTML (một file, chạy được ngoại tuyến). Sơ đồ đầy đủ: docs/CAU-TRUC.md.
// Chép tài nguyên (icon, service worker chung ở gốc) và engine mạnh (engine/, dùng chung) sang dist/; tự điền số phiên bản,
// tên cache cho service worker (theo mã băm nội dung) và chính sách nội dung (CSP) riêng cho từng trang.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const r = (...p) => path.join(ROOT, ...p);
const read = p => fs.readFileSync(r(p), 'utf8').replace(/^﻿/, '');
const pkg = JSON.parse(read('package.json'));

// Ghép module của một app: các tệp .js trong các thư mục `dirs`, sắp theo tên (số đầu tên quyết định thứ tự)
// `skip`: tên các module dùng chung mà app này không cần (cờ vây không có engine Fairy-Stockfish nên bỏ 30-fsf.js, 80-analysis.js)
function bundleApp(app) {
  const files = [], skip = app.skip || [];
  for (const s of skip) if (!fs.existsSync(r(SHARED.modules, s))) throw new Error(app.id + ': skip "' + s + '" không có trong ' + SHARED.modules);
  for (const d of app.modules) for (const f of fs.readdirSync(r(d)).filter(x => x.endsWith('.js'))) if (!(d === SHARED.modules && skip.includes(f))) files.push({ f, d });
  files.sort((a, b) => a.f < b.f ? -1 : a.f > b.f ? 1 : 0);
  for (let i = 1; i < files.length; i++) if (files[i].f === files[i - 1].f) throw new Error('Hai module trùng tên: ' + files[i].d + '/' + files[i].f + ' và ' + files[i - 1].d + '/' + files[i - 1].f);
  const parts = files.map(x => '// ==== ' + x.d + '/' + x.f + ' ====\n' + read(path.join(x.d, x.f)).replace(/\s+$/, '') + '\n');
  return '/* ' + app.title + ' ' + pkg.version + ' – mã giao diện (tự sinh từ ' + app.modules.join(', ') + ', đừng sửa trực tiếp) */\n' +
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
// pages: [[thư mục ('' là gốc), csp]]
function headersFile(pages) {
  const out = [
    '/*',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Cross-Origin-Embedder-Policy: require-corp',
    '  Cross-Origin-Resource-Policy: same-origin',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  ];
  for (const [dir, csp] of pages) {
    for (const p of ['/' + dir, '/' + dir + 'index.html']) {
      out.push(p, '  Content-Security-Policy: ' + csp + "; frame-ancestors 'none'", '  X-Frame-Options: DENY');
    }
  }
  return out.join('\n') + '\n';
}

// Phần dùng chung của mọi app
const SHARED = { modules: 'src/shared/app', css: 'src/shared/base.css', assets: 'src/shared/assets' };
// Các app cờ. Thêm loại cờ mới: thêm một mục ở đây và một thư mục src/<loại cờ>/ giống src/chess/ (xem docs/CAU-TRUC.md).
const APPS = [
  {
    id: 'xiangqi', dir: 'co-tuong/', title: 'Cờ Tướng Luyện Tập', short: 'Cờ Tướng',
    template: 'src/xiangqi/index.template.html', css: 'src/xiangqi/game.css', core: 'src/xiangqi/core/xq.js', modules: [SHARED.modules, 'src/xiangqi/app'],
    blocks: { '/*__PUZZLES__*/': ['xiangqi/puzzles.json'], '/*__OPENINGS__*/': ['xiangqi/openings.json'], '/*__TACTICS__*/': ['xiangqi/tactics.json', '[]'], '/*__BOOK__*/': ['xiangqi/book.json', '{}'] }
  },
  {
    id: 'chess', dir: 'co-vua/', title: 'Cờ Vua Luyện Tập', short: 'Cờ Vua',
    template: 'src/chess/index.template.html', css: 'src/chess/game.css', core: 'src/chess/core/chess.js', modules: [SHARED.modules, 'src/chess/app'], pieces: 'src/chess/pieces',
    blocks: { '/*__PUZZLES__*/': ['chess/puzzles.json', '[]'], '/*__OPENINGS__*/': ['chess/openings.json', '{"groups":{},"lines":[],"names":{}}'], '/*__TACTICS__*/': ['chess/tactics.json', '[]'], '/*__BOOK__*/': ['chess/book.json', '{}'] }
  },
  {
    id: 'go', dir: 'co-vay/', title: 'Cờ Vây Luyện Tập', short: 'Cờ Vây',
    template: 'src/go/index.template.html', css: 'src/go/game.css', core: 'src/go/core/go.js', modules: [SHARED.modules, 'src/go/app'],
    skip: ['30-fsf.js', '80-analysis.js'],   // không có engine Fairy-Stockfish; xem lại ván ở src/go/app/80-review.js
    blocks: { '/*__PUZZLES__*/': ['go/puzzles.json', '[]'], '/*__LESSONS__*/': ['go/lessons.json'] }
  }
];

// Hình quân cờ vua: mỗi tệp src/chess/pieces/wK.svg… thành một <symbol id="cp-wK"> nhúng vào trang (dùng bằng <use href>).
// Chưa có tệp (chưa chạy tools/chess/fetch-data.mjs) thì vẽ tạm hình tròn có chữ, để vẫn dựng và kiểm tra được.
const PIECE_NAMES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];
function pieceSymbols(dir) {
  let missing = 0;
  const out = PIECE_NAMES.map(n => {
    const f = r(dir, n + '.svg');
    if (!fs.existsSync(f)) {
      missing++;
      const w = n[0] === 'w';
      return '<symbol id="cp-' + n + '" viewBox="0 0 45 45"><circle cx="22.5" cy="22.5" r="18" fill="' + (w ? '#fff' : '#222') + '" stroke="#000" stroke-width="2"/>' +
        '<text x="22.5" y="29.5" text-anchor="middle" font-size="19" font-weight="700" font-family="sans-serif" fill="' + (w ? '#000' : '#fff') + '">' + n[1] + '</text></symbol>';
    }
    const svg = fs.readFileSync(f, 'utf8');
    const open = /<svg\b([^>]*)>/i.exec(svg), end = svg.lastIndexOf('</svg>');
    if (!open || end < 0) throw new Error(f + ' không phải SVG');
    const inner = svg.slice(open.index + open[0].length, end).replace(/<metadata[\s\S]*?<\/metadata>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    // Hình quân chỉ được chứa hình vẽ: không mã, không sự kiện, không liên kết ra ngoài
    if (/<script|\son[a-z]+\s*=|javascript:|<foreignObject|href\s*=\s*["'](?!#)/i.test(inner)) throw new Error(f + ' chứa nội dung không được phép');
    const vb = /viewBox="([^"]+)"/.exec(open[1]), w = /width="([\d.]+)/.exec(open[1]), h = /height="([\d.]+)/.exec(open[1]);
    return '<symbol id="cp-' + n + '" viewBox="' + (vb ? vb[1] : '0 0 ' + (w ? w[1] : 45) + ' ' + (h ? h[1] : 45)) + '">' + inner.trim() + '</symbol>';
  });
  if (missing) console.warn('Cảnh báo: thiếu ' + missing + ' hình quân trong ' + dir + ', dùng hình tạm (chạy node tools/chess/fetch-data.mjs).');
  return out.join('');
}

function manifest(title, short, icons) {
  const ic = (src, sizes, purpose) => ({ src: icons + src, sizes, type: 'image/png', purpose });
  return JSON.stringify({ name: title, short_name: short, lang: 'vi', start_url: './', scope: './', display: 'standalone',
    background_color: '#f3eee3', theme_color: '#2e6b5a', icons: [ic('icon-192.png', '192x192', 'any'), ic('icon-512.png', '512x512', 'any'), ic('icon-512.png', '512x512', 'maskable')] }, null, 2) + '\n';
}

// Dựng một trang HTML: nhúng các khối, điền phiên bản, ngày dựng, CSP. Trả về [html, csp]
function finishHtml(html, date) {
  html = html.split('__VERSION__').join(pkg.version).split('__BUILD_DATE__').join(date);
  const csp = cspFor(html);
  if (html.indexOf('<!--__CSP__-->') < 0) throw new Error('Mẫu HTML thiếu chỗ đặt CSP');
  html = html.replace('<!--__CSP__-->', '<meta http-equiv="Content-Security-Policy" content="' + csp + '">');
  return [html, csp];
}

function main() {
  const dist = r('dist');
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  fs.mkdirSync(r('.build'), { recursive: true });
  const date = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);
  const pages = [], sizes = [], all = crypto.createHash('sha256');

  for (const app of APPS) {
    const code = bundleApp(app);
    fs.writeFileSync(r('.build', app.id + '.js'), code);
    if (app.id === 'xiangqi') fs.writeFileSync(r('.build', 'app.js'), code);   // tên cũ, giữ cho công cụ kiểm tra lỗi mã
    const blocks = { '/*__CORE__*/': read(app.core) };
    for (const [key, [file, fallback]] of Object.entries(app.blocks)) blocks[key] = jsonData(file, fallback);
    blocks['/*__APP__*/'] = code;
    let html = read(app.template);
    const css = read(SHARED.css).replace(/\s+$/, '') + '\n' + read(app.css).replace(/\s+$/, '');
    if (/<\/style/i.test(css)) throw new Error(app.id + ': CSS chứa "</style"');
    if (html.indexOf('/*__CSS__*/') < 0) throw new Error(app.template + ' thiếu chỗ nhúng /*__CSS__*/');
    html = html.replace('/*__CSS__*/', () => css);
    if (app.pieces) {
      html = html.replace('<!--__PIECES__-->', pieceSymbols(app.pieces));
      html = html.replace(/__IC_([wb][KQRBNP])__/g, (_, n) => '<svg viewBox="0 0 45 45" aria-hidden="true"><use href="#cp-' + n + '"/></svg>');
    }
    for (const [key, val] of Object.entries(blocks)) {
      checkInline(app.id + ' ' + key, val);
      if (html.indexOf(key) < 0) throw new Error(app.template + ' thiếu chỗ nhúng ' + key);
      html = html.split(key).join(val);
    }
    const [out, csp] = finishHtml(html, date);
    const dir = path.join(dist, app.dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), out);
    fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), manifest(app.title, app.short, '../'));
    pages.push([app.dir, csp]); all.update(out);
    sizes.push(app.dir + 'index.html ' + (Buffer.byteLength(out) / 1024).toFixed(0) + ' KB');
  }
  // Trang chủ chọn loại cờ
  const [portal, pcsp] = finishHtml(read('src/portal/index.html'), date);
  fs.writeFileSync(path.join(dist, 'index.html'), portal);
  pages.unshift(['', pcsp]); all.update(portal);
  const hash = all.digest('hex').slice(0, 10);

  copyDir(r(SHARED.assets), dist);
  fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), manifest('Cờ Luyện Tập', 'Cờ Luyện Tập', ''));
  const swPath = path.join(dist, 'sw.js');
  const sw = fs.readFileSync(swPath, 'utf8');
  if (sw.indexOf('__CACHE__') < 0) throw new Error('sw.js thiếu chỗ điền __CACHE__');
  if (sw.indexOf('__CSP__') < 0) throw new Error('sw.js thiếu chỗ điền __CSP__');
  if (sw.indexOf("'__PAGES__'") < 0) throw new Error('sw.js thiếu chỗ điền __PAGES__');
  const cspMap = {}; for (const [dir, csp] of pages) cspMap[dir] = csp;
  fs.writeFileSync(swPath, sw.split('__CACHE__').join('xq-' + pkg.version + '-' + hash).split("'__CSP__'").join(JSON.stringify(cspMap))
    .split("'__PAGES__'").join(JSON.stringify([''].concat(APPS.map(a => a.dir)))));

  const eng = r('engine');
  if (fs.existsSync(eng)) copyDir(eng, path.join(dist, 'engine'), f => !/\.md$/i.test(f) && f !== 'SHA256SUMS');
  else console.warn('Cảnh báo: không có thư mục engine/, cấp 6 và phân tích ván sẽ không chạy.');
  fs.writeFileSync(path.join(dist, '.nojekyll'), '');
  // Tiêu đề cho bản trang chạy trên Cloudflare (wrangler.jsonc). GitHub Pages bỏ qua tệp này; ở đó service worker tự thêm.
  fs.writeFileSync(path.join(dist, '_headers'), headersFile(pages));
  fs.writeFileSync(r('.build', 'csp.txt'), pages.map(([d, c]) => (d || '/') + '\n' + c).join('\n\n') + '\n');

  console.log('Đã dựng ' + pkg.name + ' ' + pkg.version + ' (' + date + ', ' + hash + '): ' + sizes.join(', '));
}

try { main(); } catch (e) { console.error('Lỗi khi dựng: ' + e.message); process.exit(1); }
