import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config — Ooredoo AI Sales Coach
 * Install: npm install -D @playwright/test && npx playwright install chromium
 * Run:     npx playwright test
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL:  process.env['E2E_BASE_URL'] || 'http://localhost:4200',
    headless: true,
    trace:    'on-first-retry',
    video:    'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Start the dev server automatically during E2E runs (optional)
  // webServer: {
  //   command: 'npm run start',
  //   url:     'http://localhost:4200',
  //   reuseExistingServer: !process.env['CI'],
  // },
});
