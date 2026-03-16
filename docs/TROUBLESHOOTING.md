# トラブルシューティング

> 対象読者: 開発者・運用担当者
> よくあるエラーと対処方法をまとめる。新しいエラーが発生したら追記すること。

---

## Lambda / API エラー

### COLUMN_NOT_FOUND（get_latest が 500 を返す）

**症状**: `GET /records/latest` が全件 500 エラーを返す。CloudWatch ログに
`COLUMN_NOT_FOUND` や `Column 'xxx' cannot be resolved` が記録されている。

**原因**: Glue カタログにカラムを追加したが、S3 上の Iceberg メタデータに反映されていない。
`terraform apply` だけでは Iceberg メタデータは更新されない。

**対処**: Athena で ALTER TABLE を実行する:

```bash
aws athena start-query-execution \
  --query-string "ALTER TABLE health_records ADD COLUMNS (new_column_name string)" \
  --query-execution-context Database=health_logger_prod_health_logs \
  --result-configuration OutputLocation=s3://health-logger-prod/athena-results/ \
  --region ap-northeast-1
```

実行後に状態を確認:

```bash
aws athena get-query-execution \
  --query-execution-id <QueryExecutionId> \
  --region ap-northeast-1
```

`"State": "SUCCEEDED"` になれば修正完了。

**過去の事例**: PR #16 で `record_type` / `custom_fields` カラムを追加した際に発生。
本番で全リクエストが 500 エラーになり、ALTER TABLE で修正した。

---

### Query timeout（504）

**症状**: `GET /records/latest` や `DELETE /records/{id}` が 504 を返す。

**原因候補**:
1. Athena クエリが 10 秒以内に完了しなかった
2. パーティションプルーニングが効いていない（大量データのフルスキャン）
3. Iceberg メタデータの肥大化

**対処 1: パーティションプルーニングの確認**

`get_latest` Lambda のクエリは `WHERE user_id = '...'` のみで `dt` による絞り込みをしていない。
大量のデータが蓄積されている場合、クエリに `dt` 条件を追加することを検討する:

```sql
-- dt を追加することでスキャン量を削減できる
SELECT ... FROM health_records
WHERE user_id = '...'
  AND dt >= '2026-01-01'
ORDER BY recorded_at DESC
LIMIT 10
```

**対処 2: Athena の過去クエリ履歴を確認**

```bash
aws athena list-query-executions \
  --work-group primary \
  --region ap-northeast-1
```

実行時間が長いクエリを特定し、プランを確認する。

**対処 3: 一時的な問題の場合**

Athena は AWS のマネージドサービスのため、稀に一時的な遅延が発生する。
数分後にリトライして改善されるか確認する。

---

### Lambda が起動しない（プレースホルダー ZIP の問題）

**症状**: Lambda 関数が `InvalidParameterValueException` や起動エラーを返す。

**原因**: `lambda_s3_keys` にプレースホルダー値（`"placeholder"`）を使って
`terraform apply` した後、実際の ZIP がアップロードされていない。

**対処**: GitHub Actions の `deploy.yml` を実行して実際の ZIP をアップロードし、
Terraform を再 apply する。手動で実行する場合:

```bash
cd lambda/create_record
pip install -r requirements.txt -t . --quiet
zip -r ../../create_record.zip . -x "test_*" "*.pyc" "__pycache__/*"

SHA=$(git rev-parse HEAD)
aws s3 cp create_record.zip \
  "s3://${LAMBDA_ARTIFACTS_BUCKET}/create_record/${SHA}.zip"
```

---

## フロントエンド / 認証エラー

### Cognito ログインが redirect ループになる

**症状**: Cognito Hosted UI でログインすると、同じログイン画面に戻り続ける。

**原因候補**:
1. `callback_urls`（Cognito の許可リダイレクト先）に現在のドメインが含まれていない
2. `CORS`（`cors_allow_origins`）に現在のドメインが含まれていない
3. Amplify の設定（`main.tsx`）のドメイン・クライアント ID が間違っている

**対処 1: callback_urls の確認**

```bash
aws cognito-idp describe-user-pool-client \
  --user-pool-id ap-northeast-1_XXXXXXXXX \
  --client-id XXXXXXXXXXXXXXXXXXXXXXXXXX \
  --region ap-northeast-1 \
  --query 'UserPoolClient.CallbackURLs'
```

現在アクセスしているドメインが含まれているか確認する。
含まれていない場合は `terraform.tfvars` の `cognito_callback_urls` に追加して apply する。

**対処 2: Amplify 環境変数の確認**

AWS Console → Amplify → 該当アプリ → 「環境変数」で
`VITE_COGNITO_CLIENT_ID` などが正しく設定されているか確認する。

**対処 3: ブラウザの Cookie / localStorage のクリア**

開発ツールで `localhost:5173` の localStorage と Cookie を削除してから再試行する。

---

### オフラインキューが溜まる（IndexedDB のデータが送信されない）

**症状**: オフライン中に記録したデータが、オンライン復帰後も送信されない。

**原因候補**:
1. `flush()` が呼ばれていない（`online` イベントのリスナーが登録されていない）
2. API リクエストが認証エラーで失敗している（トークン期限切れ）
3. IndexedDB のストレージ容量が上限に達している

**対処 1: キューの内容を確認する**

ブラウザの開発ツール → Application → IndexedDB → `health_logger_db` → `offline_queue` を確認する。

**対処 2: キューを手動でクリアする**

```javascript
// ブラウザのコンソールで実行
const req = indexedDB.open('health_logger_db', 2)
req.onsuccess = (e) => {
  const db = e.target.result
  const tx = db.transaction('offline_queue', 'readwrite')
  tx.objectStore('offline_queue').clear()
  console.log('キューをクリアしました')
}
```

クリア後に再度記録を行うこと（データは失われる）。

**対処 3: ストレージ容量の確認**

```javascript
// ブラウザのコンソールで実行
navigator.storage.estimate().then(console.log)
// quota: 利用可能な最大容量
// usage: 現在の使用量
```

容量が上限に近い場合は、不要なデータを削除するかストレージをクリアする。

---

## Amplify / デプロイエラー

### Amplify GitHub 接続が切れた

**症状**: GitHub への push 後に Amplify のビルドが自動実行されない。
AWS Console の Amplify でリポジトリ接続が「切断」状態になっている。

**原因**: GitHub App の認証が期限切れ、またはリポジトリの権限変更。

**対処**: AWS Console から再接続する:

1. AWS Console → Amplify → 該当アプリを選択
2. 「アプリの設定」→ 「リポジトリを管理」
3. 「リポジトリを再接続」ボタンをクリック
4. GitHub App OAuth フローで認証する（PAT は不要）

> PAT（GitHub Personal Access Token）は使用しない。
> GitHub App OAuth で接続すること。

---

### Amplify ビルドが失敗する（buildComputeType エラー）

**症状**: Amplify ビルドが `The build compute type is not supported in this region` などのエラーで失敗する。

**原因**: `ap-northeast-1` では `STANDARD_8GB` のみサポートされている。また、カスタムビルドコンピュートタイプを使用するには IAM サービスロールが必要。

**対処**: Terraform の `modules/amplify/main.tf` で以下が設定されていることを確認する:
- `build_spec` 内の `computeType` が `STANDARD_8GB`
- Amplify サービスロール（`amplify.amazonaws.com` の trust policy）が設定されている

---

## dbt エラー

### dbt run が失敗する（接続エラー）

**症状**: `dbt run` を実行すると Athena への接続エラーが発生する。

**原因候補**:
1. `profiles.yml` が存在しない、または設定が間違っている
2. AWS 認証情報が設定されていない
3. S3 スタジングバケットへのアクセス権限がない

**対処 1: profiles.yml の確認**

```bash
docker compose -f docker-compose.dbt.yml exec dbt cat /root/.dbt/profiles.yml
```

`DBT_OPERATIONS.md` の「profiles.yml の設定」セクションを参照して正しく設定する。

**対処 2: 接続テスト**

```bash
docker compose -f docker-compose.dbt.yml exec dbt dbt debug
```

接続の各コンポーネント（profiles.yml の読み込み・Athena への接続・S3 へのアクセス）が
`OK` になるか確認する。

**対処 3: AWS 認証情報の確認**

```bash
docker compose -f docker-compose.dbt.yml exec dbt aws sts get-caller-identity
```

正しいアカウント・ユーザーが表示されるか確認する。

---

### dbt run で `relation already exists` エラー

**症状**: `dbt run` で `Relation already exists` などのエラーが発生する。

**原因**: インクリメンタルモデルの設定と実際のテーブル定義が不一致になっている。

**対処**: フルリフレッシュで再作成する:

```bash
docker compose -f docker-compose.dbt.yml exec dbt dbt run --full-refresh --select <モデル名>
```

フルリフレッシュは既存テーブルを DROP して再作成する。本番環境での実行前に影響範囲を確認すること。

---

## Terraform エラー

### terraform plan で `InvalidClientTokenId` / `AuthFailure`

**症状**: `terraform plan` 実行時に AWS 認証エラーが発生する。

**対処**: AWS 認証情報の設定を確認する:

```bash
aws sts get-caller-identity
```

認証情報が期限切れの場合は再設定する。MFA を使用している場合は一時クレデンシャルを取得する。

### terraform apply で `BucketAlreadyOwnedByYou`

**症状**: S3 バケットの作成で `BucketAlreadyOwnedByYou` エラー。

**対処**: すでに同名のバケットが存在する。Terraform の state に import する:

```bash
docker compose -f docker-compose.terraform.yml run --rm terraform \
  -chdir=terraform/envs/prod \
  import aws_s3_bucket.example <バケット名>
```
