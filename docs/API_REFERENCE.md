# API リファレンス

> 対象読者: 開発者
> health-logger の全 API エンドポイント仕様をまとめる。

---

## 共通仕様

### ベース URL

```
https://<api-id>.execute-api.ap-northeast-1.amazonaws.com
```

実際のエンドポイント URL は Terraform の出力値 `api_endpoint` を参照すること。

### 認証

全エンドポイント（`/health` を除く）に Cognito JWT が必要。

```
Authorization: Bearer <Cognito ID Token>
```

JWT トークンは `fetchAuthSession()` で取得する:

```typescript
import { fetchAuthSession } from 'aws-amplify/auth'

const session = await fetchAuthSession()
const token = session.tokens?.idToken?.toString()
```

トークンの有効期限は 1 時間。Amplify ライブラリが自動でリフレッシュする。

### レスポンス形式

```json
Content-Type: application/json
```

### 共通エラーコード

| HTTP Status | 意味 |
|------------|------|
| 400 | リクエストの形式・値が不正 |
| 401 | 認証トークンがない・無効 |
| 504 | Athena クエリがタイムアウト（10秒以内に完了しなかった） |
| 500 | サーバー内部エラー |

---

## エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /records | 体調記録を作成 |
| GET | /records/latest | 体調記録を取得 |
| DELETE | /records/{id} | 体調記録を削除 |
| GET | /item-config | カスタム項目設定を取得 |
| PUT | /item-config | カスタム項目設定を保存 |
| POST | /push/subscribe | プッシュ通知を購読 |
| DELETE | /push/subscribe | プッシュ通知を解除 |
| GET | /env | 環境データを取得（内部 Lambda 向け） |

---

## POST /records

体調記録を 1 件作成する。Lambda が Kinesis Firehose 経由で S3 (Iceberg) に書き込む。

### リクエスト

```
POST /records
Authorization: Bearer <token>
Content-Type: application/json
```

**ボディ（JSON）**

| フィールド | 型 | 必須 | 制約 | 説明 |
|-----------|-----|------|------|------|
| `record_type` | string | 任意 | `"daily"` / `"event"` / `"status"` | 記録種別（デフォルト: `"daily"`） |
| `fatigue_score` | integer | 任意 | 0 〜 100 | 疲労感スコア |
| `mood_score` | integer | 任意 | 0 〜 100 | 気分スコア |
| `motivation_score` | integer | 任意 | 0 〜 100 | やる気スコア |
| `flags` | integer | 任意 | 0 〜 63 | ビットマスク（詳細は DATABASE_SCHEMA.md 参照） |
| `note` | string | 任意 | 280文字以内 | メモ（デフォルト: 空文字） |
| `recorded_at` | string | **必須** | ISO 8601 形式 | 記録日時（例: `"2026-03-16T08:00:00+09:00"`） |
| `timezone` | string | 任意 | TZ 名 | タイムゾーン（デフォルト: `"UTC"`） |
| `device_id` | string | 任意 | — | デバイス識別子 |
| `app_version` | string | 任意 | — | アプリバージョン（デフォルト: `"1.0.0"`） |
| `custom_fields` | array | 任意 | — | カスタム項目の値配列（下記参照） |

**`custom_fields` の要素**

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `item_id` | string | 必須 | カスタム項目 ID |
| `label` | string | 必須 | 表示ラベル |
| `type` | string | 必須 | `"slider"` / `"checkbox"` / `"number"` / `"text"` |
| `value` | number \| boolean \| string | 必須 | 記録値 |

**リクエスト例**

```json
{
  "record_type": "daily",
  "fatigue_score": 60,
  "mood_score": 70,
  "motivation_score": 50,
  "flags": 9,
  "note": "今日は少し疲れた",
  "recorded_at": "2026-03-16T08:00:00+09:00",
  "timezone": "Asia/Tokyo",
  "device_id": "browser-abc123",
  "app_version": "1.2.0",
  "custom_fields": [
    {
      "item_id": "custom_001",
      "label": "睡眠時間",
      "type": "number",
      "value": 7.5
    }
  ]
}
```

### レスポンス

**成功（201）**

```json
{
  "record_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**バリデーションエラー（400）**

```json
{
  "error": "Validation failed",
  "details": [
    {
      "loc": ["fatigue_score"],
      "msg": "Input should be less than or equal to 100",
      "type": "less_than_equal"
    }
  ]
}
```

**認証エラー（401）**

```json
{
  "error": "Unauthorized"
}
```

---

## GET /records/latest

直近の体調記録を取得する。Athena にクエリを発行し、最大 10 秒ポーリングして結果を返す。

### リクエスト

```
GET /records/latest?limit=10
Authorization: Bearer <token>
```

**クエリパラメータ**

| パラメータ | 型 | 必須 | 制約 | 説明 |
|-----------|-----|------|------|------|
| `limit` | integer | 任意 | 1 〜 100（デフォルト: 10） | 取得件数 |

### レスポンス

**成功（200）**

```json
{
  "records": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "record_type": "daily",
      "fatigue_score": "60",
      "mood_score": "70",
      "motivation_score": "50",
      "flags": "9",
      "note": "今日は少し疲れた",
      "recorded_at": "2026-03-16 08:00:00.000",
      "timezone": "Asia/Tokyo",
      "device_id": "browser-abc123",
      "app_version": "1.2.0",
      "custom_fields": "[{\"item_id\":\"custom_001\",\"label\":\"睡眠時間\",\"type\":\"number\",\"value\":7.5}]",
      "written_at": "2026-03-16 08:00:05.123"
    }
  ]
}
```

> 注意: Athena はすべての値を文字列として返す。フロントエンド側で数値に変換すること。
> `custom_fields` は JSON 文字列であるため `JSON.parse()` が必要。

**クエリタイムアウト（504）**

```json
{
  "error": "Query timeout"
}
```

---

## DELETE /records/{id}

指定した体調記録を削除する。`user_id` で所有者チェックを行い、他ユーザーのレコードは削除できない。

### リクエスト

```
DELETE /records/{id}
Authorization: Bearer <token>
```

**パスパラメータ**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | string (UUID) | 必須 | 削除するレコードの ID |

### レスポンス

**成功（200）**

```json
{
  "message": "deleted"
}
```

**不正な ID 形式（400）**

```json
{
  "error": "Invalid record ID"
}
```

**削除失敗（500）**

```json
{
  "error": "Delete failed",
  "reason": "..."
}
```

---

## GET /item-config

ユーザーのカスタム項目設定を取得する。DynamoDB から取得する。

### リクエスト

```
GET /item-config
Authorization: Bearer <token>
```

### レスポンス

**成功（200）**

```json
{
  "configs": [
    {
      "item_id": "custom_001",
      "label": "睡眠時間",
      "type": "number",
      "mode": "form",
      "order": 1,
      "unit": "時間",
      "min": 0,
      "max": 24
    },
    {
      "item_id": "custom_002",
      "label": "頭痛の強さ",
      "type": "slider",
      "mode": "status",
      "order": 2,
      "min": 0,
      "max": 10
    }
  ]
}
```

設定が未登録の場合は空配列 `{ "configs": [] }` を返す。

---

## PUT /item-config

ユーザーのカスタム項目設定を保存する。既存の設定は全件上書きされる。

### リクエスト

```
PUT /item-config
Authorization: Bearer <token>
Content-Type: application/json
```

**ボディ（JSON）**

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `configs` | array | 必須 | 項目設定の配列 |

**`configs` の各要素**

| フィールド | 型 | 必須 | 制約 | 説明 |
|-----------|-----|------|------|------|
| `item_id` | string | 必須 | — | 一意の識別子 |
| `label` | string | 必須 | — | 表示ラベル |
| `type` | string | 必須 | `"slider"` / `"checkbox"` / `"number"` / `"text"` | 入力種別 |
| `mode` | string | 必須 | `"form"` / `"event"` / `"status"` | 表示モード |
| `order` | number | 任意 | — | 表示順序 |
| `icon` | string | 任意 | — | アイコン名 |
| `min` | number | 任意 | — | 最小値（slider / number） |
| `max` | number | 任意 | — | 最大値（slider / number） |
| `unit` | string | 任意 | — | 単位（例: `"時間"`, `"kg"`） |

**リクエスト例**

```json
{
  "configs": [
    {
      "item_id": "custom_001",
      "label": "睡眠時間",
      "type": "number",
      "mode": "form",
      "order": 1,
      "unit": "時間",
      "min": 0,
      "max": 24
    }
  ]
}
```

### レスポンス

**成功（200）**

```json
{
  "message": "saved"
}
```

**バリデーションエラー（400）**

```json
{
  "error": "type must be one of ['checkbox', 'number', 'slider', 'text']"
}
```

---

## POST /push/subscribe

Web Push 通知の購読を登録する。ブラウザの `PushSubscription` オブジェクトを送信する。

### リクエスト

```
POST /push/subscribe
Authorization: Bearer <token>
Content-Type: application/json
```

**ボディ（JSON）**

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `subscription` | object | 必須 | Web Push Subscription オブジェクト |
| `subscription.endpoint` | string | 必須 | ブラウザの Push エンドポイント URL |
| `subscription.keys` | object | 必須 | `p256dh` / `auth` キーを含むオブジェクト |

**リクエスト例**

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "BXXXXXXXXXXXXXXXXXXXXXXX...",
      "auth": "AXXXXXXXXXX..."
    }
  }
}
```

### レスポンス

**成功（200）**

```json
{
  "message": "subscribed"
}
```

---

## DELETE /push/subscribe

Web Push 通知の購読を解除する。DynamoDB から購読情報を削除する。

### リクエスト

```
DELETE /push/subscribe
Authorization: Bearer <token>
```

### レスポンス

**成功（200）**

```json
{
  "message": "unsubscribed"
}
```

---

## GET /env（内部 Lambda 向け）

環境データ（気象・大気質）を Open-Meteo API から取得して S3 に保存する。
API Gateway 経由のエンドポイントではなく、EventBridge スケジューラーから呼び出す内部 Lambda。

### 呼び出し方法

EventBridge から自動実行（デフォルト: 毎日前日分を取得）。

手動実行する場合は AWS CLI で Lambda を直接呼び出す:

```bash
aws lambda invoke \
  --function-name health-logger-prod-get-env-data \
  --payload '{}' \
  --region ap-northeast-1 \
  output.json
```

バックフィル（過去日分の一括取得）:

```bash
aws lambda invoke \
  --function-name health-logger-prod-get-env-data \
  --payload '{"backfill": true, "date_from": "2026-01-01", "date_to": "2026-01-31"}' \
  --region ap-northeast-1 \
  output.json
```

### ペイロード（オプション）

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `backfill` | boolean | 任意 | `true` にすると `date_from` 〜 `date_to` の範囲を取得 |
| `date_from` | string | backfill 時 | 開始日（`YYYY-MM-DD`） |
| `date_to` | string | backfill 時 | 終了日（`YYYY-MM-DD`） |
| `location_id` | string | 任意 | 地点 ID（デフォルト: `"musashikosugi"`） |

### レスポンス

**成功（200）**

```json
{
  "message": "Success",
  "total_records": 24,
  "saved_files": 1
}
```

---

## ヘルスチェック

`GET /records/latest` を処理する Lambda は `/health` パスに対して認証なしで 200 を返す。

```bash
curl https://<api-endpoint>/health
# → {"status": "ok"}
```
