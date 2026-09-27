import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/challenges', timeout: 90000, workers: 1, reporter: 'list', outputDir: './test-output/challenges',
  use: { baseURL: 'http://127.0.0.1:4196', browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure', launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } },
  webServer: { command: 'node tests/challengeDevServer.mjs', url: 'http://127.0.0.1:4196', reuseExistingServer: false },
})
