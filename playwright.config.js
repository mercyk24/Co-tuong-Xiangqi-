// Kiểm tra giao diện đầu-cuối bằng Playwright (Chromium). Chạy: npm run test:e2e
// Đặt biến CHROME_PATH để dùng Chrome có sẵn trên máy thay vì Chromium do Playwright tải về.
'use strict';
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;
module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    defaultBrowserType: 'chromium',
    baseURL: 'http://localhost:' + PORT + '/',
    trace: 'retain-on-failure',
    // Cho phép WebRTC nối hai trang trên cùng máy khi kiểm tra chơi qua mạng
    launchOptions: Object.assign({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] }, process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  },
  webServer: {
    command: 'node scripts/serve.js ' + PORT,
    url: 'http://localhost:' + PORT + '/co-tuong/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
