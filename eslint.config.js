// Cấu hình ESLint (không cần plugin). Mã giao diện được kiểm tra trên bản ghép .build/app.js
// vì các module trong src/app/ dùng chung một phạm vi; chạy "npm run lint" sẽ dựng lại bản ghép trước.
'use strict';

const browser = Object.fromEntries([
  'window', 'self', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'console',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'fetch', 'Response', 'Headers', 'Request', 'URL', 'Blob', 'File', 'FileReader', 'Worker', 'caches',
  'SharedArrayBuffer', 'performance', 'getComputedStyle', 'matchMedia', 'Event', 'CustomEvent', 'postMessage'
].map(k => [k, 'readonly']));
const node = Object.fromEntries(['require', 'module', 'exports', 'process', '__dirname', '__filename', 'console', 'Buffer', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'URL'].map(k => [k, 'readonly']));

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
  { ignores: ['node_modules/', 'dist/', 'engine/', 'src/app/', 'test-results/', 'playwright-report/', 'data/'] },
  { files: ['.build/app.js', 'src/core/**/*.js'], languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { ...browser, XQ: 'readonly', PUZZLES: 'readonly', OPENINGS: 'readonly', TACTICS: 'readonly', BOOK: 'readonly', APP_VERSION: 'readonly', module: 'readonly' } }, rules },
  { files: ['src/assets/sw.js'], languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { ...browser } }, rules },
  { files: ['scripts/**/*.js', 'tools/**/*.js', 'tests/**/*.js', '*.config.js', 'eslint.config.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: node }, rules },
  // Kiểm tra giao diện và chụp màn hình có đoạn mã chạy trong trang (page.evaluate), nên cho phép thêm biến của trình duyệt và của app.
  { files: ['tests/e2e/**/*.js', 'scripts/screenshots.js'], languageOptions: { globals: { ...browser, ...node, XQ: 'readonly', OPENINGS: 'readonly', TACTICS: 'readonly', PUZZLES: 'readonly' } } }
];
