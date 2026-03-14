import { test, expect } from '@playwright/test'
import { mockApi } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  // ヘッダーが表示されるまで待つ（認証・データ読み込み完了の目安）
  await expect(page.locator('text=Health Logger')).toBeVisible()
})

// ── テスト 01: スライダー3本が表示される ──────────────────────────────
test('01: スライダー3本（疲労感・気分・やる気）が表示される', async ({ page }) => {
  await expect(page.locator('text=疲労感')).toBeVisible()
  await expect(page.locator('text=気分')).toBeVisible()
  await expect(page.locator('text=やる気')).toBeVisible()

  // スライダー（type=range）が3本存在する
  const sliders = page.locator('input[type="range"]')
  await expect(sliders).toHaveCount(3)
})

// ── テスト 02: ステータスボタン4件が表示される ───────────────────────
test('02: ステータスボタン4件（頭痛・腹痛・眠い・勤務中）が表示される', async ({ page }) => {
  await expect(page.locator('text=ステータス')).toBeVisible()
  await expect(page.locator('text=頭痛')).toBeVisible()
  await expect(page.locator('text=腹痛')).toBeVisible()
  await expect(page.locator('text=眠い')).toBeVisible()
  await expect(page.locator('text=勤務中')).toBeVisible()
})

// ── テスト 03: クイックイベントボタン4件が表示される ─────────────────
test('03: クイックイベントボタン4件（睡眠不足・運動・アルコール・カフェイン）が表示される', async ({ page }) => {
  await expect(page.locator('text=クイックイベント')).toBeVisible()
  await expect(page.locator('text=睡眠不足')).toBeVisible()
  await expect(page.locator('text=運動')).toBeVisible()
  await expect(page.locator('text=アルコール')).toBeVisible()
  await expect(page.locator('text=カフェイン')).toBeVisible()
})
