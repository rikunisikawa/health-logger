import { test as setup, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// .env.test.local から認証情報を読み込む
dotenv.config({ path: path.resolve(__dirname, '../.env.test.local') })

const AUTH_FILE = path.join(__dirname, '.auth/user.json')

setup('Cognito ログインしてセッションを保存', async ({ page }) => {
  const email    = process.env.E2E_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD

  if (!email || !password) {
    throw new Error(
      'E2E_TEST_EMAIL と E2E_TEST_PASSWORD を frontend/.env.test.local に設定してください'
    )
  }

  // アプリにアクセス → Cognito Hosted UI にリダイレクト
  await page.goto('/')
  await page.getByRole('button', { name: 'ログイン' }).click()

  // Cognito ログインページ (auth.ap-northeast-1.amazoncognito.com)
  await page.waitForURL(/amazoncognito\.com/)
  await page.locator('input[name="username"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('[type="submit"]').click()

  // アプリ本体に戻るまで待つ
  await page.waitForURL('https://main.d24eyg8x5429ma.amplifyapp.com/**')
  await expect(page.locator('text=Health Logger')).toBeVisible({ timeout: 15_000 })

  // セッション状態を保存（以後のテストで再利用）
  await page.context().storageState({ path: AUTH_FILE })
})
