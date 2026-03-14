import type { Page } from '@playwright/test'

/** API Gateway 呼び出しをモック（実際のデータを書き換えない） */
export async function mockApi(page: Page) {
  // POST /records（体調記録・イベント・ステータス送信）
  await page.route('**/records', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ record_id: 'test-record-id-001' }),
      })
    } else {
      await route.continue()
    }
  })

  // GET /records/latest（直近記録取得）
  await page.route('**/records/latest**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        records: [
          {
            id: 'rec-001',
            record_type: 'daily',
            fatigue_score: '60',
            mood_score: '70',
            motivation_score: '55',
            flags: '0',
            note: 'テスト前回値',
            recorded_at: new Date().toISOString(),
            timezone: 'Asia/Tokyo',
            device_id: 'test-device',
            app_version: '1.0.0',
            custom_fields: '[]',
            written_at: new Date().toISOString(),
          },
        ],
      }),
    })
  })

  // GET /item-config（カスタム項目取得）
  await page.route('**/item-config**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configs: [
            {
              item_id: 'custom-status-01',
              label: 'カスタムステータス',
              type: 'checkbox',
              mode: 'status',
              order: 0,
              icon: '🔵',
            },
          ],
        }),
      })
    } else {
      // POST /item-config（保存）
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'saved' }),
      })
    }
  })
}
