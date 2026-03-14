import { test, expect } from '@playwright/test'
import { mockApi } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await expect(page.locator('text=Health Logger')).toBeVisible()
})

// ── テスト 07: 記録する → 成功トーストが表示される ───────────────────
test('07: 「記録する」ボタン押下で成功トーストが表示される', async ({ page }) => {
  await page.getByRole('button', { name: '記録する' }).click()
  await expect(page.locator('text=記録しました')).toBeVisible()
})

// ── テスト 08: メモの文字カウントが更新される ────────────────────────
test('08: メモ入力で文字カウントが更新される', async ({ page }) => {
  // 初期状態: 0/280
  await expect(page.locator('text=0/280')).toBeVisible()

  await page.locator('textarea').fill('テスト入力')
  // 5文字入力後: 5/280
  await expect(page.locator('text=5/280')).toBeVisible()
})

// ── テスト 09: 過去日時を選択すると警告バッジが表示される ─────────────
test('09: 過去日時を選択すると「過去日時で記録中」バッジが表示される', async ({ page }) => {
  // 1時間前の日時を設定
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const pastValue = `${oneHourAgo.getFullYear()}-${pad(oneHourAgo.getMonth()+1)}-${pad(oneHourAgo.getDate())}T${pad(oneHourAgo.getHours())}:${pad(oneHourAgo.getMinutes())}`

  await page.locator('input[type="datetime-local"]').fill(pastValue)

  await expect(page.locator('text=過去日時で記録中')).toBeVisible()
  await expect(page.locator('button', { hasText: '現在時刻に戻す' })).toBeVisible()
})

// ── テスト 10: 「現在時刻に戻す」でバッジが消える ────────────────────
test('10: 「現在時刻に戻す」ボタンで「過去日時で記録中」バッジが消える', async ({ page }) => {
  // 過去日時をセット
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const pastValue = `${oneHourAgo.getFullYear()}-${pad(oneHourAgo.getMonth()+1)}-${pad(oneHourAgo.getDate())}T${pad(oneHourAgo.getHours())}:${pad(oneHourAgo.getMinutes())}`
  await page.locator('input[type="datetime-local"]').fill(pastValue)
  await expect(page.locator('text=過去日時で記録中')).toBeVisible()

  // 戻すボタンをクリック
  await page.locator('button', { hasText: '現在時刻に戻す' }).click()
  await expect(page.locator('text=過去日時で記録中')).not.toBeVisible()
})
