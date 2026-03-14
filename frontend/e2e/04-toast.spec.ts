import { test, expect } from '@playwright/test'
import { mockApi } from './mocks'

// ── テスト 11: トーストが画面最上部に固定表示される ───────────────────
test('11: トーストが position:fixed でビューポート最上部に表示される', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await expect(page.locator('text=Health Logger')).toBeVisible()

  // 一番下までスクロール
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

  // 「記録する」ボタンを押す（スクロールしたまま）
  await page.getByRole('button', { name: '記録する' }).click()

  const toast = page.locator('[role="alert"]')
  await expect(toast).toBeVisible()

  // position: fixed かつ top: 0px であることを確認
  const styles = await toast.evaluate((el) => {
    const s = window.getComputedStyle(el)
    return { position: s.position, top: s.top }
  })
  expect(styles.position).toBe('fixed')
  expect(styles.top).toBe('0px')
})
