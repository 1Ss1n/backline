import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/phone/**', '**/challenges/**'],
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: './test-output/browser',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: !process.env.CI,
  },
})
