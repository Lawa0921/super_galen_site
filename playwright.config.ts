import { defineConfig, devices } from '@playwright/test';
import { getE2EPort } from './tests/e2e/support/server-settings.mjs';

const baseURL = `http://127.0.0.1:${getE2EPort()}`;

// Exercise RTS WebGL with the same Chromium/GPU launch used for acceptance,
// while keeping the existing non-RTS browser projects unchanged.
const chromiumLaunch={channel:'chromium' as const,args:['--enable-gpu','--force_high_performance_gpu']};
const allRts=/games-rts.*\.spec\.ts$/;
// RTS v1 is a desktop mouse/keyboard game. Keep the supported mobile fallback
// in every project while reserving battlefield controls for desktop browsers.
const desktopRts=/games-rts(?!-small-screen\.spec\.ts$).*\.spec\.ts$/;

/**
 * Playwright E2E 測試配置
 * 用於測試 Astro 網站的功能完整性
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // 增加超時時間以適應較慢的頁面載入
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  // 增加全局測試超時
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  projects: [
    {
      name: 'chromium',
      testIgnore: allRts,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-rts',
      testMatch: allRts,
      use: { ...devices['Desktop Chrome'],launchOptions:chromiumLaunch },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], video: 'off' },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      testIgnore: desktopRts,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      testIgnore: desktopRts,
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    command: 'node tests/e2e/support/server.mjs',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
