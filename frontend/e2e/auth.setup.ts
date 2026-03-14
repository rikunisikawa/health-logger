import { test as setup, expect } from '@playwright/test'
import { fileURLToPath } from 'url'
import * as path from 'path'
import * as fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const envPath = path.resolve(__dirname, '../.env.test.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
}

const AUTH_FILE = path.join(__dirname, '.auth/user.json')

setup('Cognito ログインしてセッションを保存', async ({ page }) => {
  const email    = process.env.E2E_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD

  if (!email || !password) {
    throw new Error('E2E_TEST_EMAIL と E2E_TEST_PASSWORD を frontend/.env.test.local に設定してください')
  }

  await page.goto('/')
  await page.waitForLoadState('networkidle')

  if (!page.url().includes('amazoncognito.com')) {
    await page.getByRole('button', { name: 'ログイン' }).click()
    await page.waitForURL(/amazoncognito\.com/, { timeout: 15_000 })
  }

  // visible な要素のみを対象にする
  await page.locator('input[name="username"]:visible').fill(email)
  await page.locator('input[name="password"]:visible').fill(password)
  // Cognito Hosted UI の Sign in ボタンはクリックが効かないため Enter キーで送信
  await page.locator('input[name="password"]:visible').press('Enter')

  await page.waitForURL('https://main.d24eyg8x5429ma.amplifyapp.com/**', { timeout: 20_000 })
  await expect(page.locator('text=Health Logger')).toBeVisible({ timeout: 15_000 })

  await page.context().storageState({ path: AUTH_FILE })
  console.log('✓ セッションを保存しました:', AUTH_FILE)
})
