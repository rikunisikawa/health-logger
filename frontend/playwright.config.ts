import { defineConfig, devices } from '@playwright/test'

/**
 * 本番 Amplify URL に対して E2E テストを実行する。
 *
 * 事前準備:
 *   frontend/.env.test.local を作成して以下を設定（git管理外）:
 *     E2E_TEST_EMAIL=your-cognito-email@example.com
 *     E2E_TEST_PASSWORD=your-cognito-password
 *
 * 実行:
 *   npx playwright test              # 全件
 *   npx playwright test e2e/01       # 特定ファイル
 *   npx playwright test --ui         # UI モード
 */

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    baseURL: 'https://main.d24eyg8x5429ma.amplifyapp.com',
    storageState: 'e2e/.auth/user.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
      use: { storageState: undefined },
    },
    {
      name: 'chromium',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
  ],
})
