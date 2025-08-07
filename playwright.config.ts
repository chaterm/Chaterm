import { defineConfig } from '@playwright/test'

/**
 * Playwright config - Chaterm Electron E2E tests
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './tests/test-results',
  /* Test run configuration */
  fullyParallel: false, // Electron tests are recommended to run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Usually only one instance of Electron app can run at a time

  /* Timeout settings */
  // timeout: 60000, // 60 seconds timeout for a single test
  expect: {
    timeout: 10000 // 10 seconds timeout for assertions
  },

  /* Reporter configuration */
  reporter: [
    ['html', { outputFolder: './tests/playwright-report' }],
    ['json', { outputFile: './tests/playwright-report/results.json' }],
    ['junit', { outputFile: './tests/playwright-report/results.xml' }]
  ],

  /* Global test settings */
  use: {
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    /* Record video */
    video: 'retain-on-failure',
    /* Collect trace for debugging */
    trace: 'on-first-retry'
    /* Increase action timeout */
    // actionTimeout: 30000
  },

  /* Single project configuration - Electron */
  projects: [
    {
      name: 'electron',
      testDir: './tests/e2e',
      use: {
        // Special configuration for Electron app
        // Note: Do not use launchOptions, use _electron API in tests
      }
    }
  ]
})
