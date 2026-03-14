import { test, expect } from '@playwright/test'
import { mockApi } from './mocks'

test.beforeEach(async ({ page }) => {
  // localStorage をクリアしてテスト間の状態汚染を防ぐ
  await page.addInitScript(() => {
    localStorage.removeItem('health_logger_active_statuses')
  })
  await mockApi(page)
  await page.goto('/')
  await expect(page.locator('text=Health Logger')).toBeVisible()
})

// ── テスト 04: ステータスボタン → ON になる ──────────────────────────
test('04: ステータスボタンをクリックすると ON になる', async ({ page }) => {
  const btn = page.locator('button', { hasText: '頭痛' })
  // クリック前: btn-warning クラスなし（OFF 状態）
  await expect(btn).not.toHaveClass(/btn-warning(?!\s*btn-outline)/)

  await btn.click()
  // クリック後: 「ON」ラベルが表示される
  await expect(btn.locator('text=ON')).toBeVisible()
  // btn-warning（塗りつぶし）が適用されている
  await expect(btn).toHaveClass(/btn-warning/)
})

// ── テスト 05: ON → 再クリックで OFF になる ──────────────────────────
test('05: ON のステータスボタンを再クリックすると OFF になる', async ({ page }) => {
  const btn = page.locator('button', { hasText: '頭痛' })

  // 1回目: ON
  await btn.click()
  await expect(btn.locator('text=ON')).toBeVisible()

  // 2回目: OFF
  await btn.click()
  await expect(btn.locator('text=ON')).not.toBeVisible()
  await expect(btn).not.toHaveClass(/btn-warning(?!\s*btn-outline)/)
})

// ── テスト 06: リロード後も ON 状態が保持される ──────────────────────
test('06: ページリロード後も ON 状態が保持される（localStorage 永続化）', async ({ page }) => {
  const btn = page.locator('button', { hasText: '眠い' })

  // ON にする
  await btn.click()
  await expect(btn.locator('text=ON')).toBeVisible()

  // リロード
  await mockApi(page) // route は reload 後に再設定が必要
  await page.reload()
  await expect(page.locator('text=Health Logger')).toBeVisible()

  // ON 状態が復元されている
  const reloadedBtn = page.locator('button', { hasText: '眠い' })
  await expect(reloadedBtn.locator('text=ON')).toBeVisible()
  await expect(reloadedBtn).toHaveClass(/btn-warning/)
})
