import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression testing configuration for Percy.
 * Captures screenshots of key pages for visual regression detection.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e/visual-regression',
  fullyParallel: false, // Run sequentially for consistent visual captures
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker for visual consistency
  reporter: [
    ['html', { outputFolder: 'visual-regression-report' }],
    ['json', { outputFile: 'visual-regression-results.json' }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Percy integration
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    // Course player visual regression projects at key breakpoints.
    // These capture the lesson page and assert no horizontal scroll.
    {
      name: 'course-player-375',
      testMatch: /course-player.*\.spec\.ts/,
      use: {
        ...devices['iPhone SE'],
        // iPhone SE is 375 x 667
        viewport: { width: 375, height: 667 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'course-player-768',
      testMatch: /course-player.*\.spec\.ts/,
      use: {
        ...devices['iPad (gen 7)'],
        // iPad portrait is 768 x 1024
        viewport: { width: 768, height: 1024 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'course-player-1280',
      testMatch: /course-player.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev -- --port 3001',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },

  timeout: 60000,
  expect: {
    timeout: 10000,
  },
});