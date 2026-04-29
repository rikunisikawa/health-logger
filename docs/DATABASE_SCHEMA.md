# データベーススキーマ

> 対象読者: 開発者
> S3 Tables (Iceberg) および DynamoDB のテーブル構成を記載する。

---

## 1. S3 Tables (Iceberg) — health_records

体調記録の主テーブル。Kinesis Firehose が Iceberg 形式で S3 Tables に書き込む。
Athena からクエリする場合は Glue カタログを経由する。

### カラム定義

| カラム名 | 型 | 必須 | 説明 |
|---------|-----|------|------|
| `id` | string (UUID) | 必須 | レコード一意識別子（`uuid.uuid4()` で生成） |
| `user_id` | string (UUID) | 必須 | Cognito の `sub`（ユーザー識別子） |
| `record_type` | string | 必須 | 記録種別: `"daily"` / `"event"` / `"status"` |
| `fatigue_score` | integer | 任意 | 疲労感（0 〜 100）。NULL 許容 |
| `mood_score` | integer | 任意 | 気分（0 〜 100）。NULL 許容 |
| `motivation_score` | integer | 任意 | やる気（0 〜 100）。NULL 許容 |
| `flags` | integer | 必須 | ビットマスク（下記参照） |
| `note` | string | 任意 | メモ（280文字以内）。デフォルト空文字 |
| `recorded_at` | string (ISO 8601) | 必須 | ユーザーが記録した日時 |
| `timezone` | string | 任意 | タイムゾーン名（例: `"Asia/Tokyo"`） |
| `device_id` | string | 任意 | デバイス識別子 |
| `app_version` | string | 任意 | アプリバージョン（例: `"1.2.0"`） |
| `custom_fields` | string (JSON) | 任意 | カスタム項目の値配列（下記参照） |
| `written_at` | string (ISO 8601) | 必須 | Lambda が書き込んだ UTC 日時 |
| `dt` | string (YYYY-MM-DD) | 必須 | パーティション列（`recorded_at` の日付部分） |

### パーティション戦略

```
パーティション列: dt = YYYY-MM-DD
```

`recorded_at` の先頭 10 文字（`YYYY-MM-DD`）を `dt` として保存する。
Athena クエリで `WHERE dt = '2026-03-16'` のように絞り込むとパーティションプルーニングが働き、
スキャン量を大幅に削減できる。

```sql
-- パーティションを活用したクエリ例
SELECT * FROM health_records
WHERE user_id = '...'
  AND dt BETWEEN '2026-03-01' AND '2026-03-16'
ORDER BY recorded_at DESC
LIMIT 10
```

---

## 2. FLAGS ビットマスク

`flags` カラムはビットマスク（整数）でライフスタイルフラグを記録する。

| フラグ名 | ビット値 | 説明 |
|---------|---------|------|
| `poor_sleep` | 1 (2^0) | 睡眠の質が悪かった |
| `headache` | 2 (2^1) | 頭痛あり |
| `stomachache` | 4 (2^2) | 腹痛あり |
| `exercise` | 8 (2^3) | 運動した |
| `alcohol` | 16 (2^4) | 飲酒した |
| `caffeine` | 32 (2^5) | カフェインを摂取した |

**最大値**: 63（すべてのフラグが ON の場合: 1+2+4+8+16+32）

**計算例**

```python
# 睡眠不足 + 運動 のフラグを設定する場合
flags = 1 + 8  # = 9

# フラグの読み出し
has_poor_sleep  = (flags & 1) != 0   # True
has_headache    = (flags & 2) != 0   # False
has_stomachache = (flags & 4) != 0   # False
did_exercise    = (flags & 8) != 0   # True
had_alcohol     = (flags & 16) != 0  # False
had_caffeine    = (flags & 32) != 0  # False
```

**dbt でのデコード例（Athena SQL）**

```sql
-- fct_health_env_joined_hourly.sql より
bitwise_and(flags, 1)  != 0 as has_poor_sleep,
bitwise_and(flags, 2)  != 0 as has_headache,
bitwise_and(flags, 4)  != 0 as has_stomachache,
bitwise_and(flags, 8)  != 0 as did_exercise,
bitwise_and(flags, 16) != 0 as had_alcohol,
bitwise_and(flags, 32) != 0 as had_caffeine
```

---

## 3. custom_fields の JSON 構造

`custom_fields` カラムは JSON 文字列として保存される（Athena の Iceberg 制約のため）。

**フォーマット**

```json
[
  {
    "item_id": "custom_001",
    "label": "睡眠時間",
    "type": "number",
    "value": 7.5
  },
  {
    "item_id": "custom_002",
    "label": "頭痛の強さ",
    "type": "slider",
    "value": 3
  },
  {
    "item_id": "custom_003",
    "label": "ストレッチした",
    "type": "checkbox",
    "value": true
  }
]
```

**`type` の種別と `value` の型対応**

| type | value の型 | 説明 |
|------|-----------|------|
| `slider` | integer / float | スライダー値 |
| `checkbox` | boolean | チェックボックス |
| `number` | integer / float | 数値入力 |
| `text` | string | テキスト入力 |

**Athena での読み出し例**

```sql
-- custom_fields は文字列なので JSON 関数で展開
SELECT
  id,
  recorded_at,
  json_extract_scalar(cf, '$.value') AS custom_value,
  json_extract_scalar(cf, '$.label') AS custom_label
FROM health_records
CROSS JOIN UNNEST(CAST(json_parse(custom_fields) AS ARRAY(JSON))) AS t(cf)
WHERE user_id = '...'
  AND json_extract_scalar(cf, '$.item_id') = 'custom_001'
```

---

## 4. Iceberg スキーマ変更の注意事項

Terraform の `glue:UpdateTable` は **Glue カタログのメタデータのみ**を更新する。
S3 上の Iceberg メタデータファイル（`metadata.json`）は自動では更新されない。

### カラム追加後に必要な手順

`terraform apply` でカラムを追加した後、Athena DDL を手動実行すること:

```bash
aws athena start-query-execution \
  --query-string "ALTER TABLE health_records ADD COLUMNS (new_col string)" \
  --query-execution-context Database=health_logger_prod_health_logs \
  --result-configuration OutputLocation=s3://health-logger-prod/athena-results/ \
  --region ap-northeast-1
```

この手順を省略すると `get_latest` Lambda が `COLUMN_NOT_FOUND` エラーで全件 500 になる。

**過去の失敗**: PR #16 で `record_type`/`custom_fields` を追加した際に ALTER TABLE を省略してしまい、
本番で全リクエストが 500 エラーになった。Glue カラム追加後は必ず Athena DDL を実行すること。

---

## 5. DynamoDB — item_configs

ユーザーのカスタム項目設定を保存するテーブル。

**テーブル名**: `health-logger-prod-item-configs`

| 属性 | 型 | キー種別 | 説明 |
|------|-----|---------|------|
| `user_id` | String | パーティションキー | Cognito の `sub` |
| `configs` | String | — | `ItemConfig[]` を JSON 文字列化した値 |

**特徴**:
- ユーザーごとに 1 レコード（全設定を 1 アイテムにまとめて保存）
- 設定の保存は `PutItem`（全件上書き）、取得は `GetItem`
- TTL / GSI は設定なし

---

## 6. DynamoDB — push_subscriptions

Web Push 通知の購読情報を保存するテーブル。

**テーブル名**: `health-logger-prod-push-subscriptions`

| 属性 | 型 | キー種別 | 説明 |
|------|-----|---------|------|
| `user_id` | String | パーティションキー | Cognito の `sub` |
| `subscription` | String | — | Web Push `PushSubscription` を JSON 文字列化した値 |

**`subscription` の内部構造**

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "BXXXXXXXXXXXXXXXXXXXXXXX...",
    "auth": "AXXXXXXXXXX..."
  }
}
```

**購読の自動削除**:
`push_notify` Lambda がプッシュ送信に失敗し、ブラウザから 404 または 410 が返った場合、
その購読情報を自動的に DynamoDB から削除する（期限切れ・手動解除済みの端末をクリーンアップ）。

---

## 7. DynamoDB — daily_summaries

日次バッチ集計結果のキャッシュテーブル。`aggregate_daily` Lambda が毎日 AM 2:00 JST に書き込む。
`GET /summary` エンドポイントはこのテーブルを参照し、Athena への直接クエリを回避する（< 100ms）。

**テーブル名**: `health-logger-prod-daily-summaries`

| 属性 | 型 | キー種別 | 説明 |
|------|-----|---------|------|
| `user_id` | String | パーティションキー | Cognito の `sub` |
| `date` | String | ソートキー | 集計対象日（`YYYY-MM-DD`） |
| `avg_fatigue` | String | — | 疲労感スコアの平均 |
| `avg_mood` | String | — | 気分スコアの平均 |
| `avg_motivation` | String | — | やる気スコアの平均 |
| `record_count` | String | — | 集計対象レコード数 |

**集計ロジック**:
- 対象: `record_type = 'daily'` のレコードのみ
- パーティション列 `dt` で絞り込み（パーティションプルーニング適用）
- `aggregate_daily` Lambda が Athena で `AVG()` / `COUNT()` → DynamoDB に `PutItem`

**更新タイミング**:
EventBridge Scheduler が毎日 17:00 UTC（AM 2:00 JST）に `aggregate_daily` Lambda を呼び出す。
