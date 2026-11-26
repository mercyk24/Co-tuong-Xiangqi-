// [DÙNG CHUNG] Một service worker cho mọi trang (trang chủ, /co-tuong/, /co-vua/, /co-vay/). Sơ đồ: docs/CAU-TRUC.md
// Service worker chung cho cả trang (trang chủ và các trang cờ): lưu app để dùng ngoại tuyến, đồng thời thêm hai tiêu đề
// COOP/COEP để trình duyệt cho phép engine mạnh (SharedArrayBuffer) và các tiêu đề bảo mật (CSP, chống nhúng trang vào khung).
const CACHE = '__CACHE__'; // build tự điền: phiên bản + mã băm nội dung, nên mỗi bản mới tự xoá cache cũ
const ENGINE = 'xq-engine-v2'; // file engine nặng (13 MB) được giữ riêng, không bị xoá khi cập nhật app
// build tự điền: CSP của từng trang theo thư mục ('' trang chủ, 'co-tuong/', 'co-vua/', 'co-vay/'), giống thẻ meta trong trang,
// thêm frame-ancestors (thẻ meta không làm được). Mỗi trang có mã nhúng riêng nên CSP khác nhau.
const CSP = '__CSP__';
const PAGES = '__PAGES__';   // build tự điền từ danh sách app trong scripts/build.js: ['', 'co-tuong/', 'co-vua/', 'co-vay/']
const ASSETS = ['manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
for (const d of PAGES) { ASSETS.push(d || './', d + 'index.html'); if (d) ASSETS.push(d + 'manifest.webmanifest'); }
// Thư mục của trang chứa địa chỉ này, tính từ gốc của service worker ('' / 'co-tuong/' / 'co-vua/' / 'co-vay/')
function pageDir(url) {
  const base = new URL(self.registration.scope).pathname, p = url.pathname;
  const rel = p.indexOf(base) === 0 ? p.slice(base.length) : p;
  for (const d of PAGES) if (d && rel.indexOf(d) === 0) return d;
  return '';
}
function coi(res, dir) {
  if (!res || res.status === 0 || res.type === 'opaque') return res;
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  // GitHub Pages không cho đặt tiêu đề: service worker thêm các tiêu đề bảo mật thay cho máy chủ
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'no-referrer');
  if ((h.get('Content-Type') || '').indexOf('text/html') === 0 && CSP[dir]) {
    h.set('Content-Security-Policy', CSP[dir] + "; frame-ancestors 'none'");
    h.set('X-Frame-Options', 'DENY');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== ENGINE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;
  const url = new URL(r.url);
  if (url.origin !== location.origin) return;
  const bucket = url.pathname.indexOf('/engine/') >= 0 ? ENGINE : CACHE, dir = pageDir(url);
  // Địa chỉ trang không có dấu / cuối (…/co-vua): chuyển sang …/co-vua/ để đường dẫn tương đối trong trang đúng
  if (r.mode === 'navigate' && PAGES.some(d => d && url.pathname.endsWith('/' + d.slice(0, -1)))) {
    e.respondWith(Response.redirect(url.pathname + '/' + url.search + url.hash, 301)); return;
  }
  e.respondWith(caches.match(r, { ignoreSearch: r.mode === 'navigate' }).then(hit => hit ? coi(hit, dir) : fetch(r).then(res => {
    if (res && res.ok) { const copy = res.clone(); caches.open(bucket).then(c => c.put(r, copy)); }
    return coi(res, dir);
  }).catch(() => caches.match(dir + 'index.html').then(x => coi(x, dir)))));
});
