/**
 * Playwright Configuration for Relay Tests
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 120000, // 2 minutes per test
  expect: {
    timeout: 10000 // 10 seconds for assertions
  },
  fullyParallel: false, // Run tests sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for sequential execution
  reporter: [
    ['list'],
    ['html', { outputFolder: '.screenshots/test-results' }]
  ],
  use: {
    baseURL: 'http://localhost:7786',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true, // Run in headless mode
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
    launchOptions: {
      slowMo: 100 // Slow down by 100ms for stability
    }
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Don't start server automatically - expect it to be running
  // webServer: {
  //   command: 'python3 relay.py server -p 7786',
  //   port: 7786,
  //   timeout: 120000,
  //   reuseExistingServer: true,
  // },
});
