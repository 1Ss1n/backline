import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/phone', timeout: 60000, workers: 1, reporter: 'list', outputDir: './test-output/phone',
  use: { baseURL: 'http://127.0.0.1:4186', browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } },
  webServer: { command: 'node tests/phoneMicDevServer.mjs', url: 'http://127.0.0.1:4186', reuseExistingServer: false },
})
