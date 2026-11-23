// Service worker: lưu app để dùng ngoại tuyến, đồng thời thêm hai tiêu đề COOP/COEP để trình duyệt cho phép engine mạnh (SharedArrayBuffer).
const CACHE = 'xq-v8';
const ENGINE = 'xq-engine-v1'; // file engine nặng (13 MB) được giữ riêng, không bị xoá khi cập nhật app
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
function coi(res) {
  if (!res || res.status === 0 || res.type === 'opaque') return res;
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== ENGINE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;
  const url = new URL(r.url);
  const bucket = url.pathname.indexOf('/wasm-demo/') >= 0 ? ENGINE : CACHE;
  e.respondWith(caches.match(r).then(hit => hit ? coi(hit) : fetch(r).then(res => {
    if (res && res.ok && url.origin === location.origin) { const copy = res.clone(); caches.open(bucket).then(c => c.put(r, copy)); }
    return coi(res);
  }).catch(() => caches.match('index.html').then(coi))));
});
