# dbt 操作ガイド

> 対象読者: 開発者・データエンジニア
> dbt の実行方法・モデル構成・運用上の注意点を記載する。

---

## 概要

dbt は環境データ（気象・花粉・大気質）の変換レイヤーとして使用する。
Athena（dbt-athena-community アダプター）を DWH として使用する。

**CI/CD には組み込まれていない。** ローカルまたは devcontainer から手動実行する。

### dbt モデルの構成

```
data/dbt/models/
  staging/
    stg_env__hourly.sql         # 環境データ（型変換・クレンジング）
    stg_health__records.sql     # 体調記録（型変換・正規化）
  intermediate/
    int_env_daily_agg.sql       # 環境データ日次集約
    int_env_pressure_features.sql  # 気圧フィーチャー計算
    int_health__daily_scores.sql   # 体調スコア日次集約
  marts/
    environment/
      fct_environment_hourly.sql  # 環境データ（時間粒度、公開用）
      fct_environment_daily.sql   # 環境データ（日次粒度、公開用）
    health/
      fct_health_env_joined_hourly.sql  # 体調 × 環境 結合ファクト
```

**データリネージ**:

```
raw_env (S3 / Glue)        health_records (Iceberg)
        ↓                          ↓
  stg_env__hourly          stg_health__records
        ↓                          ↓
  int_env_daily_agg         int_health__daily_scores
  int_env_pressure_features
        ↓                          ↓
  fct_environment_hourly ──→ fct_health_env_joined_hourly
  fct_environment_daily
```

---

## 実行方法

### 方法 1: Docker Compose（推奨）

dbt と dbt-mcp（AI コーディング用 MCP サーバー）を含む構成。

**起動**:

```bash
# 全サービス起動（dbt + dbt-mcp）
docker compose -f docker-compose.dbt.yml up -d

# dbt のみ起動（最小構成）
docker compose -f docker-compose.dbt.yml up -d dbt
```

**前提条件**:
- `data/dbt/profiles/profiles.yml` が存在すること（後述）
- `~/.aws` に認証情報が設定されていること

**dbt コマンドの実行**:

```bash
# dbt run（全モデルを実行）
docker compose -f docker-compose.dbt.yml exec dbt dbt run

# dbt test（全テストを実行）
docker compose -f docker-compose.dbt.yml exec dbt dbt test

# 特定のモデルのみ実行
docker compose -f docker-compose.dbt.yml exec dbt dbt run --select stg_env__hourly

# ドキュメント生成
docker compose -f docker-compose.dbt.yml exec dbt dbt docs generate
```

### 方法 2: devcontainer（VS Code）

`.devcontainer/` の構成で VS Code Dev Container を使用する場合、
コンテナ内で直接 dbt コマンドを実行できる。

```bash
# コンテナ内のターミナルで実行
cd /workspace
dbt run
dbt test
```

---

## profiles.yml の設定

`data/dbt/profiles/profiles.yml` はリポジトリ管理外（`.gitignore` 済み）。
初回セットアップ時に手動で作成する。

```yaml
health_logger_dbt:
  target: prod
  outputs:
    prod:
      type: athena
      region_name: ap-northeast-1
      s3_staging_dir: s3://health-logger-prod/dbt-staging/
      schema: health_logger_dbt_prod
      database: awsdatacatalog
      aws_profile: default  # ~/.aws/credentials のプロファイル名
      work_group: primary
```

> `s3_staging_dir` は Athena のクエリ結果保存先。prod バケット内の専用プレフィックスを使う。

---

## 主要コマンドリファレンス

### dbt build（run + test を一括実行）

```bash
docker compose -f docker-compose.dbt.yml exec dbt dbt build
```

### dbt run（モデルの実行）

```bash
# 全モデルを実行
docker compose -f docker-compose.dbt.yml exec dbt dbt run

# 特定のモデルのみ
docker compose -f docker-compose.dbt.yml exec dbt dbt run --select fct_health_env_joined_hourly

# 依存するモデルも含めて実行（+ を付ける）
docker compose -f docker-compose.dbt.yml exec dbt dbt run --select +fct_health_env_joined_hourly

# 特定のタグのモデルのみ
docker compose -f docker-compose.dbt.yml exec dbt dbt run --select tag:daily
```

### dbt test

```bash
# 全テストを実行
docker compose -f docker-compose.dbt.yml exec dbt dbt test

# 特定のモデルのテストのみ
docker compose -f docker-compose.dbt.yml exec dbt dbt test --select stg_env__hourly
```

### インクリメンタルモデルのフルリフレッシュ

インクリメンタルモデルで過去データを再計算したい場合:

```bash
docker compose -f docker-compose.dbt.yml exec dbt dbt run --full-refresh
```

フルリフレッシュは既存テーブルを DROP して再作成するため、実行前に影響範囲を確認すること。

### source freshness チェック

ソースデータが期待通りの鮮度で届いているか確認する:

```bash
docker compose -f docker-compose.dbt.yml exec dbt dbt source freshness
```

`sources.yml` に `freshness` 設定がある場合、閾値超えで警告またはエラーになる。

### dbt docs の生成と確認

```bash
# ドキュメント生成
docker compose -f docker-compose.dbt.yml exec dbt dbt docs generate

# ドキュメントサーバーの起動
docker compose -f docker-compose.dbt.yml exec dbt dbt docs serve --port 8080
```

ブラウザで `http://localhost:8080` にアクセスすると、モデルのリネージグラフや
カラム定義を視覚的に確認できる。

---

## dbt-mcp サーバー（AI コーディング連携）

dbt-mcp コンテナは Claude Code などの AI ツールから dbt 操作を自然言語で実行できる MCP サーバー。

**接続先**: `http://localhost:8811/mcp`

Claude Code の MCP 設定（`.claude/mcp_settings.json`）に追加することで使用できる。

起動確認:

```bash
curl http://localhost:8811/mcp
```

---

## スキーマ変更時の注意

dbt モデルのカラムを変更（追加・削除・型変更）する場合:

### 1. Athena（Iceberg）テーブルへの影響確認

`stg_health__records.sql` は `health_records` Iceberg テーブルを参照している。
`health_records` にカラムを追加した後は、Athena で ALTER TABLE が必要:

```bash
aws athena start-query-execution \
  --query-string "ALTER TABLE health_records ADD COLUMNS (new_col string)" \
  --query-execution-context Database=health_logger_prod_health_logs \
  --result-configuration OutputLocation=s3://health-logger-prod/athena-results/ \
  --region ap-northeast-1
```

### 2. dbt モデルの更新

1. 対象の `.sql` ファイルを修正する
2. 対応する `schema.yml` のカラム定義も更新する
3. `dbt run --select <変更したモデル> --full-refresh` で再実行する

### 3. 下流モデルへの影響確認

```bash
# 変更したモデルの下流モデルをすべて確認
docker compose -f docker-compose.dbt.yml exec dbt dbt ls --select stg_env__hourly+
```

`+` を末尾に付けると下流モデル（依存しているモデル）の一覧が表示される。

---

## コンテナの停止

```bash
docker compose -f docker-compose.dbt.yml down
```

dbt-target ボリューム（コンパイル成果物）も削除する場合:

```bash
docker compose -f docker-compose.dbt.yml down -v
```
