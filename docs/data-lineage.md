# データリネージ（データの流れと追跡）

> データリネージとは「データがどこで生まれ、どこを通り、どこに蓄積されるか」を記録したもの。
> 障害発生時の原因特定、データ品質の担保、規制対応に必要。

---

## 1. データの全体フロー

```
[発生源]              [転送]              [蓄積]           [利用]
ユーザー操作
  ↓
ブラウザ（React）
  ↓ HTTPS POST
API Gateway           Lambda              Firehose         Athena
  ↓ JWT検証           ↓ バリデーション    ↓ バッファ5分    ↓ SQL クエリ
  ↓ ────────────────→ ↓ ───────────────→ S3 (Iceberg)  ──→ ↓
                      付与: record_id                       フロントエンド
                      付与: user_id (JWTから)               （グラフ表示）
                      付与: written_at（Lambda処理時刻）
```

---

## 2. データ項目の発生源と変換

### ユーザーが入力するデータ

| 項目 | 発生源 | 型 | 制約 |
|------|-------|-----|------|
| fatigue_score | スライダー操作 | 整数 | 0〜100 |
| mood_score | スライダー操作 | 整数 | 0〜100 |
| motivation_score | スライダー操作 | 整数 | 0〜100 |
| flags | チェックボックス | 整数（ビットマスク） | 0〜63 |
| note | テキスト入力 | 文字列 | 最大280文字 |
| recorded_at | アプリが自動設定 | ISO 8601 文字列 | ブラウザの現在時刻 |
| timezone | アプリが自動設定 | 文字列 | ブラウザのタイムゾーン |

### システムが付与するデータ

| 項目 | 付与者 | 内容 |
|------|-------|------|
| id (record_id) | Lambda | UUID v4（ランダム生成・一意） |
| user_id | Lambda | JWT の `sub` クレーム（Cognito ユーザーID） |
| written_at | Lambda | Lambda が処理した UTC 時刻 |
| dt | Lambda | recorded_at の日付部分（パーティション用） |

---

## 3. データの変換ポイント

### 変換1: ブラウザ → API（型の変換）

```
ブラウザで送信する JSON:
{
  "fatigue_score": 70,          ← JavaScript の number 型
  "recorded_at": "2026-03-14T09:00:00.000Z"  ← 文字列
}

Lambda で受け取る Python オブジェクト:
  rec.fatigue_score = 70        ← Python の int 型（Pydantic が変換）
  rec.recorded_at = "2026-03-14T09:00:00.000Z"  ← str 型
```

### 変換2: Lambda → Firehose（フォーマット変換）

```python
# 保存される JSON Lines 形式（1レコード = 1行）
{"id": "abc-123", "user_id": "xyz-456", "fatigue_score": 70, ..., "written_at": "2026-03-14T09:00:05Z"}\n
{"id": "def-789", "user_id": "xyz-456", "fatigue_score": 60, ..., "written_at": "2026-03-14T21:00:03Z"}\n
```

### 変換3: Firehose → S3（バッファリング）

```
Firehose は以下のどちらか先に達したらS3に書き出す:
  - データサイズが 5MB に達したとき
  - 300秒（5分）経過したとき

→ リアルタイムではなく最大5分の遅延がある
```

### 変換4: S3 → Athena（クエリ時）

```
Athena は S3 の JSON ファイルを読み込み SQL で検索する
recorded_at の文字列 → TIMESTAMP 型として扱う
fatigue_score の数値 → そのまま数値として扱う
```

---

## 4. データの保存場所一覧

| データ種別 | 保存場所 | 形式 | 保持期間 |
|----------|---------|------|---------|
| 健康記録（raw） | S3 Tables (Iceberg) | JSON Lines | 無期限（明示設定なし） |
| Athena クエリ結果 | S3 (athena-results/) | CSV | 明示設定なし |
| Lambda コード | S3 (artifacts/) | ZIP | デプロイ履歴分 |
| Terraform State | S3 (health-logger-tfstate-prod) | JSON | 無期限 |
| ユーザー情報 | Cognito User Pool | AWS 管理 | アカウント削除まで |
| プッシュ通知登録 | DynamoDB | JSON | アカウント削除まで |

---

## 5. データ品質チェックポイント

### 入力時（Lambda バリデーション）

```
✅ チェック済み:
  - スコア値が 0〜100 の範囲か
  - flags が 0〜63 の範囲か（6ビットのビットマスク）
  - note が 280文字以内か
  - record_type が "daily" または "event" のみか

⚠️ チェックされていない:
  - recorded_at が未来の時刻でないか（不正な日時を記録できる）
  - device_id の内容（ユーザーエージェント文字列の検証なし）
```

### 保存後（Athena クエリで確認可能）

```sql
-- 異常値チェック（スコアが範囲外のレコード）
SELECT * FROM health_records
WHERE fatigue_score NOT BETWEEN 0 AND 100
   OR mood_score NOT BETWEEN 0 AND 100;

-- 重複チェック（同一 id が複数存在しないか）
SELECT id, COUNT(*) FROM health_records
GROUP BY id HAVING COUNT(*) > 1;

-- 欠損チェック（recorded_at が NULL のレコード）
SELECT COUNT(*) FROM health_records
WHERE recorded_at IS NULL;
```

---

## 6. データの削除フロー

```
ユーザーが削除ボタンを押す
  ↓
DELETE /records/{id}
  ↓
delete_record Lambda
  ↓
Athena で soft delete（削除フラグを立てる）または
Iceberg の DELETE 文でレコード削除

⚠️ 注意: Firehose 経由で S3 に書き込まれたデータは
         Iceberg テーブルでの削除後も S3 のデータファイルには残る
         （Iceberg がファイルレベルではなくメタデータで削除管理するため）
```

---

## 7. 外部データの取り込み（環境データ）

```
外部 Air Quality API（気象情報サービス）
  ↓ 定期取得（Lambda: get_env_data）
  ↓
Firehose
  ↓
S3 Tables (env_data テーブル)
  ↓
Athena でヘルスデータと結合してダッシュボード表示

⚠️ 外部データのため:
  - 提供元のAPIが止まるとデータ欠損が発生する
  - データの正確性は外部サービスに依存する
```

---

## 8. データリネージの可視化（概要図）

```
[ユーザー入力]
  ├─ スライダー値 (fatigue/mood/motivation)
  ├─ フラグ (poor_sleep/headache 等)
  └─ メモ (note)
         ↓
[フロントエンド: HealthForm.tsx]
  付与: recorded_at, timezone, device_id, app_version
         ↓ HTTPS
[API Gateway]
  検証: JWT トークン
  抽出: user_id (Cognito sub)
         ↓
[Lambda: create_record/handler.py]
  バリデーション: Pydantic（models.py）
  付与: record_id (UUID), written_at, dt
         ↓
[Firehose]
  バッファ: 最大5分
         ↓
[S3 Tables: health_records テーブル (Iceberg)]
  管理: Glue Catalog（スキーマ情報）
         ↓
[Athena]
  クエリ: get_latest Lambda
         ↓
[フロントエンド: DashboardPage.tsx]
  表示: グラフ・履歴
```
