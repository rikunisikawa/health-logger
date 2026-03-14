import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    baseURL: 'https://main.d24eyg8x5429ma.amplifyapp.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Step 1: 認証セットアップ（storageState なしで実行）
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
    },
    // Step 2: 機能テスト（保存済みセッションを使用）
    {
      name: 'chromium',
      use: {
        ...devices['Pixel 5'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
})
