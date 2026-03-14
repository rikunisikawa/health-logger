import { test, expect } from '@playwright/test'
import { mockApi } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await expect(page.locator('text=Health Logger')).toBeVisible()
})

// ── テスト 12: ⚙️ ボタンで設定画面が開く ─────────────────────────────
test('12: ⚙️ ボタンで設定画面が開く', async ({ page }) => {
  await page.locator('button[title="記録項目の設定"]').click()
  await expect(page.locator('text=記録項目の設定')).toBeVisible()
})

// ── テスト 13: 新規追加フォームに「追加」ボタンが表示される ───────────
test('13: 新規追加フォームを開くと「追加」ボタンが表示される', async ({ page }) => {
  await page.locator('button[title="記録項目の設定"]').click()
  await page.locator('button', { hasText: '＋ 項目を追加' }).click()

  // フォームが表示される
  await expect(page.locator('input[placeholder="例: 水分補給, 筋トレ"]')).toBeVisible()
  // 新規追加なので「追加」ボタン
  await expect(page.locator('button', { hasText: '追加' })).toBeVisible()
  await expect(page.locator('button', { hasText: '更新' })).not.toBeVisible()
})

// ── テスト 14: 既存項目編集で「更新」ボタン・ステータスモードが表示される
test('14: 既存項目の編集で「更新」ボタンが表示され、モードに「ステータス」が含まれる', async ({ page }) => {
  await page.locator('button[title="記録項目の設定"]').click()

  // mocks.ts で返しているカスタムステータス項目の「編集」ボタンをクリック
  await page.locator('button', { hasText: '編集' }).first().click()

  // 編集時は「更新」ボタン
  await expect(page.locator('button', { hasText: '更新' })).toBeVisible()
  await expect(page.locator('button', { hasText: '追加' })).not.toBeVisible()

  // 記録モードのドロップダウンに「ステータス」が含まれる
  const modeSelect = page.locator('select').nth(1) // 2番目のselect = 記録モード
  await expect(modeSelect.locator('option', { hasText: 'ステータス（状態管理）' })).toBeAttached()
})
