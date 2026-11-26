// Cấu hình ESLint (không cần plugin). Mã giao diện được kiểm tra trên bản ghép .build/xiangqi.js và .build/chess.js
// vì các module trong src/shared/, src/app/, src/chess/app/ dùng chung một phạm vi; chạy "npm run lint" sẽ dựng lại bản ghép trước.
'use strict';

const browser = Object.fromEntries([
  'window', 'self', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'console',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'fetch', 'Response', 'Headers', 'Request', 'URL', 'Blob', 'File', 'FileReader', 'Worker', 'caches',
  'SharedArrayBuffer', 'WebSocket', 'BroadcastChannel', 'RTCPeerConnection', 'history', 'performance', 'getComputedStyle', 'matchMedia', 'Event', 'CustomEvent', 'postMessage'
].map(k => [k, 'readonly']));
const node = Object.fromEntries(['require', 'module', 'exports', 'process', '__dirname', '__filename', 'console', 'Buffer', 'WebSocket', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'URL', 'fetch'].map(k => [k, 'readonly']));

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-func-assign': 'error',
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-sparse-arrays': 'error',
  'no-unsafe-negation': 'error',
  'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-empty': ['error', { allowEmptyCatch: false }],
  'no-eval': 'off',
  'no-implied-eval': 'error',
  'no-with': 'error',
  'no-var': 'error',
  'prefer-const': ['error', { destructuring: 'all' }],
  'eqeqeq': ['error', 'smart']
};

module.exports = [
  { ignores: ['node_modules/', 'dist/', 'engine/', 'src/app/', 'src/shared/', 'src/chess/', 'src/portal/', '.build/app.js', 'test-results/', 'playwright-report/', 'data/'] },
  { files: ['.build/xiangqi.js', '.build/chess.js', 'src/core/**/*.js'], languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { ...browser, XQ: 'readonly', CH: 'readonly', PUZZLES: 'readonly', OPENINGS: 'readonly', TACTICS: 'readonly', BOOK: 'readonly', APP_VERSION: 'readonly', module: 'readonly' } }, rules },
  { files: ['src/assets/sw.js'], languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { ...browser } }, rules },
  // Điểm hẹn riêng (server/) và công cụ thử tải: mô-đun ES, chạy trên Cloudflare Workers hoặc Node
  { files: ['server/**/*.mjs', 'tools/**/*.mjs'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...node, Response: 'readonly', WebSocketPair: 'readonly', WebSocketRequestResponsePair: 'readonly' } }, rules },
  { files: ['scripts/**/*.js', 'tools/**/*.js', 'tests/**/*.js', '*.config.js', 'eslint.config.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: node }, rules },
  // Kiểm tra giao diện và chụp màn hình có đoạn mã chạy trong trang (page.evaluate), nên cho phép thêm biến của trình duyệt và của app.
  { files: ['tests/e2e/**/*.js', 'scripts/screenshots.js', 'tools/check-peerjs-official.js'], languageOptions: { globals: { ...browser, ...node, XQ: 'readonly', CH: 'readonly', OPENINGS: 'readonly', TACTICS: 'readonly', PUZZLES: 'readonly' } } }
];
