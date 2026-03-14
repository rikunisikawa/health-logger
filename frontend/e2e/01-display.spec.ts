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
  // 最近の記録の "気分:70" などと重複しないよう exact 指定
  await expect(page.getByText('疲労感', { exact: true })).toBeVisible()
  await expect(page.getByText('気分', { exact: true })).toBeVisible()
  await expect(page.getByText('やる気', { exact: true })).toBeVisible()

  // スライダー（type=range）が3本存在する
  const sliders = page.locator('input[type="range"]')
  await expect(sliders).toHaveCount(3)
})

// ── テスト 02: ステータスボタン4件が表示される ───────────────────────
test('02: ステータスボタン4件（頭痛・腹痛・眠い・勤務中）が表示される', async ({ page }) => {
  // "カスタムステータス" ボタンと重複しないよう heading ロールで指定
  await expect(page.getByRole('heading', { name: 'ステータス' })).toBeVisible()
  await expect(page.getByText('頭痛', { exact: true })).toBeVisible()
  await expect(page.getByText('腹痛', { exact: true })).toBeVisible()
  await expect(page.getByText('眠い', { exact: true })).toBeVisible()
  await expect(page.getByText('勤務中', { exact: true })).toBeVisible()
})

// ── テスト 03: クイックイベントボタン4件が表示される ─────────────────
test('03: クイックイベントボタン4件（睡眠不足・運動・アルコール・カフェイン）が表示される', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'クイックイベント' })).toBeVisible()
  await expect(page.getByText('睡眠不足', { exact: true })).toBeVisible()
  await expect(page.getByText('運動', { exact: true })).toBeVisible()
  await expect(page.getByText('アルコール', { exact: true })).toBeVisible()
  await expect(page.getByText('カフェイン', { exact: true })).toBeVisible()
})
