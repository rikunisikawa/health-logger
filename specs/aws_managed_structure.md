# 要件定義書 — Health Logger AWSマネージド構成移行

**バージョン**: 1.2
**作成日**: 2026-02-28
**更新日**: 2026-02-28
**対象**: 現行ECSベース構成 → フルサーバーレス・AWSマネージド構成への移行

## 確定済み技術スタック

| レイヤー | 言語 / ランタイム | 確定内容 |
|---------|----------------|---------|
| フロントエンド (PWA) | **React + TypeScript** | Amplify Hosting でビルド・配信 |
| Lambda (API) | **Python 3.13** | boto3 + Pydantic v2 |
| インフラ定義 | **Terraform** | 既存資産を継続利用 |
| Lambda デプロイ | **GitHub Actions** | ZIP生成 → S3 → terraform apply |
| AWS環境 | **prod のみ** | dev環境は構築しない |
| データストア | **S3 Tables (Iceberg)** | 検証しながら進める |
| 既存データ移行 | **しない** | 本番は新規スタート |
| GET /records/latest | **Athena直接クエリ** | UIでローディングスピナー表示 |
| Cognitoドメイン | **デフォルトドメイン** | auth.ap-northeast-1.amazoncognito.com |
| MFA | **オプション (TOTP)** | ユーザーが任意に設定 |

---

## 1. 背景と目的

### 1.1 現行構成の課題

| 課題 | 内容 |
|------|------|
| 運用負荷 | ECS Fargate上のRailsコンテナのパッチ適用・バージョン管理が必要 |
| コスト | ALB + NAT Gateway + ECS常時起動で月約5,000〜10,000円の固定費 |
| スケーラビリティ | リクエスト急増時にECS Serviceのタスクスケール設定が必要 |
| 認証の限界 | HTTP Basic AuthはMFA非対応・セッション管理が貧弱 |

### 1.2 移行目的

- **インフラ運用ゼロ**: サーバー管理・コンテナ管理を完全に排除
- **従量課金**: ほぼゼロ記録日はコストほぼゼロ（個人利用に最適）
- **マネージド認証**: Cognitoで多要素認証・トークンリフレッシュを委任
- **ストリーム取り込み**: Firehoseで自動バッファリング・S3への信頼性の高いデリバリー

---

## 2. 移行後アーキテクチャ概要

```
[ユーザー (PWA)]
      │ HTTPS
      ▼
[フロントエンド配信]
  Amplify Hosting  ─OR─  S3 + CloudFront
      │
      │ ① 認証 (Cognito Hosted UI or Amplify Auth)
      ▼
[Amazon Cognito User Pool]
  - メール/パスワード認証
  - JWT (ID Token / Access Token) 発行
      │
      │ ② APIコール (Authorization: Bearer <JWT>)
      ▼
[Amazon API Gateway (HTTP API)]
  - Cognitoオーソライザーで JWT 検証
  - ルーティング: POST /records, GET /records/latest
      │
      │ ③ Lambda呼び出し
      ▼
[AWS Lambda (Python 3.13)]
  - バリデーション (scores 0-100, note ≤ 280文字)
  - メタデータ付与 (user_id, recorded_at, app_version)
      │
      │ ④ レコード送信
      ▼
[Amazon Kinesis Data Firehose]
  - バッファ: 5MB or 60秒 (どちらか先)
  - 形式変換: JSON → Apache Parquet (Glue Schema Registry経由)
  - エラー配信先: S3 errors/プレフィックス
      │
      │ ⑤ Parquet書き込み
      ▼
[Amazon S3 Tables]
  - フォーマット: Apache Iceberg (S3 Tablesネイティブ)
  - パーティション: dt (日付), user_id
  - バケット: health-logger-prod-tables
      │
      │ ⑥ クエリ
      ▼
[Amazon Athena]
  - エンジン: Athena v3 (Iceberg対応)
  - カタログ: AWS Glue Data Catalog
  - 結果格納: s3://health-logger-prod-athena-results/
```

---

## 3. コンポーネント詳細要件

### 3.1 フロントエンド配信

#### 選択肢比較

| 観点 | Amplify Hosting | S3 + CloudFront |
|------|----------------|-----------------|
| セットアップ | GitHubと直結・自動デプロイ | 手動設定が必要 |
| カスタムドメイン | 自動SSL | ACM + CloudFront手動 |
| ビルドパイプライン | Amplify独自 (amplify.yml) | GitHub Actions |
| コスト | 無料枠あり (ビルド1000分/月) | CloudFront転送量のみ |
| 既存資産流用 | HTML/CSS/JSそのまま移行可 | 同左 |

**確定**: Amplify Hosting（GitHubと連携し、デプロイパイプラインを内包するため）

#### Amplify Hosting 要件
- ソース: GitHubリポジトリ `main` ブランチ
- **ビルド**: Vite + React + TypeScript → `dist/` に出力
- `@aws-amplify/auth` でCognitoとの認証フローを処理
- PWAマニフェスト・Service Workerの配信対応（`Cache-Control: no-store` をSWに設定）
- カスタムドメイン: 不使用（Amplifyデフォルトドメインを利用）

**`amplify.yml` ビルド設定**:
```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build        # vite build → dist/
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

**フロントエンド構成 (`frontend/`)**:
```
frontend/
  src/
    main.tsx                   # エントリーポイント
    App.tsx                    # ルーティング・認証ガード
    components/
      HealthForm.tsx           # スライダー + フラグチェックボックス
      AuthGuard.tsx            # 未認証リダイレクト
      LoadingSpinner.tsx       # Athenaクエリ待ち表示
    hooks/
      useAuth.ts               # Cognito認証フック
      useOfflineQueue.ts       # IndexedDB オフラインキュー
    api.ts                     # API Gateway クライアント
    types.ts                   # 共有型定義
  public/
    sw.js                      # Service Worker (Viteビルド対象外)
    manifest.json
  vite.config.ts
  tsconfig.json
  package.json
```

**主要パッケージ**:
```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@aws-amplify/auth": "^6.0.0",
    "aws-amplify": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

**型定義例 (`types.ts`)**:
```typescript
export interface HealthRecordInput {
  fatigue_score:    number;   // 0-100
  mood_score:       number;   // 0-100
  motivation_score: number;   // 0-100
  flags?:           number;   // bitmask 0-63, default 0
  note?:            string;   // max 280 chars
  timezone?:        string;   // IANA timezone
  app_version:      string;
}

export interface HealthRecordResponse {
  record_id: string;
}

export interface LatestRecord extends HealthRecordInput {
  record_id:          string;
  user_id:            string;
  recorded_at:        string;
  server_received_at: string;
}
```

### 3.2 Amazon Cognito

#### User Pool 設定

| 項目 | 設定値 |
|------|--------|
| サインイン識別子 | メールアドレス |
| パスワードポリシー | 最低8文字、大文字・数字・記号を含む |
| MFA | オプション（TOTP） |
| メール確認 | 必須（Cognitoマネージドメール or SES） |
| トークン有効期限 | ID Token: 1時間 / Refresh Token: 30日 |
| ユーザー属性 | `email` (必須), `custom:timezone` (任意) |

#### App Client 設定

| 項目 | 設定値 |
|------|--------|
| 認証フロー | `ALLOW_USER_SRP_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH` |
| Hosted UI | 使用（デフォルトドメイン: `auth.ap-northeast-1.amazoncognito.com`） |
| コールバックURL | `https://<amplify-domain>/callback` |
| ログアウトURL | `https://<amplify-domain>/` |
| OAuthスコープ | `openid`, `email`, `profile` |

#### Identity Pool（オプション）
S3への直接アップロード（将来の添付ファイル機能）が必要な場合に追加。当初は不要。

#### MFA設定
- **方式**: オプション（TOTP: Google Authenticator等）
- ユーザーが自身のアカウント設定から任意に有効化
- 個人利用のため強制は不要と判断

### 3.3 Amazon API Gateway (HTTP API)

#### エンドポイント定義

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/records` | 健康記録の登録 |
| GET | `/records/latest` | 直近N件の取得（Athenaクエリ） |
| GET | `/health` | ヘルスチェック（認証不要） |

#### セキュリティ設定

- **オーソライザー**: Cognito JWT Authorizer（HTTP API標準機能）
  - Issuer: `https://cognito-idp.<region>.amazonaws.com/<UserPoolId>`
  - Audience: App Client ID
- **CORS**: Amplifyドメインのみ許可 (`Access-Control-Allow-Origin: https://<amplify-domain>`)
- **スロットリング**: 1000 req/秒（バースト）, 100 req/秒（定常）

#### ステージ設定
- `dev` ステージ: ログ出力 DEBUG、X-Ray無効
- `prod` ステージ: ログ出力 ERROR、X-Ray有効

### 3.4 AWS Lambda

#### 関数設計

| 関数名 | トリガー | ランタイム | メモリ | タイムアウト |
|--------|----------|-----------|--------|------------|
| `health-logger-create-record` | API GW POST /records | **Python 3.13** | 256 MB | 10秒 |
| `health-logger-get-latest` | API GW GET /records/latest | **Python 3.13** | 256 MB | 30秒 |

**ディレクトリ構成 (`lambda/`)**:
```
lambda/
  create_record/
    handler.py        # Lambda エントリーポイント
    models.py         # Pydantic モデル (バリデーション)
    requirements.txt  # pydantic>=2.0, boto3
  get_latest/
    handler.py
    requirements.txt  # boto3
```

#### `create-record` Lambda 処理仕様

**入力 (API Gateway Event)**:
```json
{
  "body": {
    "fatigue_score": 70,
    "mood_score": 60,
    "motivation_score": 50,
    "flags": 9,
    "note": "今日は疲れた",
    "timezone": "Asia/Tokyo",
    "app_version": "1.0.0"
  }
}
```

**バリデーション規則**:
- `fatigue_score`, `mood_score`, `motivation_score`: 0〜100の整数（必須）
- `flags`: 0〜63のビットマスク整数（デフォルト0）
  - bit0: poor_sleep, bit1: headache, bit2: stomachache
  - bit3: exercise, bit4: alcohol, bit5: caffeine
- `note`: 最大280文字のUTF-8文字列（任意）
- `timezone`: IANA timezone文字列（任意、デフォルト `Asia/Tokyo`）

**メタデータ付与**:
```json
{
  "record_id": "<UUID v4>",
  "user_id": "<Cognito sub>",
  "recorded_at": "2026-02-28T12:00:00+09:00",
  "server_received_at": "2026-02-28T03:00:00Z",
  "app_version": "1.0.0"
}
```

**Firehoseへの送信**:
- `PutRecord` API使用
- DeliveryStream名: `health-logger-prod-stream`

**レスポンス**:
- 成功: `201 Created` + `{ "record_id": "<uuid>" }`
- バリデーションエラー: `400 Bad Request` + `{ "errors": [...] }`
- サーバーエラー: `500 Internal Server Error`

**実装例 (`lambda/create_record/models.py`)**:
```python
from pydantic import BaseModel, Field

class HealthRecordInput(BaseModel):
    fatigue_score:    int       = Field(..., ge=0, le=100)
    mood_score:       int       = Field(..., ge=0, le=100)
    motivation_score: int       = Field(..., ge=0, le=100)
    flags:            int       = Field(default=0, ge=0, le=63)
    note:             str | None = Field(default=None, max_length=280)
    timezone:         str       = Field(default="Asia/Tokyo")
    app_version:      str       = Field(default="unknown")
```

**実装例 (`lambda/create_record/handler.py`)**:
```python
import json
import uuid
import boto3
from datetime import datetime, timezone
from pydantic import ValidationError
from models import HealthRecordInput

firehose = boto3.client("firehose")

def handler(event, context):
    # JWT claims から user_id (Cognito sub) を取得
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    user_id = claims["sub"]

    # バリデーション (Pydantic v2)
    try:
        body = HealthRecordInput.model_validate(
            json.loads(event.get("body") or "{}")
        )
    except ValidationError as e:
        return {
            "statusCode": 400,
            "body": json.dumps({"errors": e.errors()}),
        }

    # メタデータ付与
    record = {
        **body.model_dump(),
        "record_id":          str(uuid.uuid4()),
        "user_id":            user_id,
        "server_received_at": datetime.now(timezone.utc).isoformat(),
    }

    # Firehose へ送信
    firehose.put_record(
        DeliveryStreamName="health-logger-prod-stream",
        Record={"Data": (json.dumps(record, ensure_ascii=False) + "\n").encode()},
    )

    return {
        "statusCode": 201,
        "body": json.dumps({"record_id": record["record_id"]}),
    }
```

#### `get-latest` Lambda 処理仕様

**クエリパラメータ**:
- `limit`: 取得件数（デフォルト10、最大100）
- `since`: ISO8601日時（任意、フィルタリング）

**処理**: Athena `StartQueryExecution` → ポーリング → 結果返却

**Athenaクエリ遅延の対処方針**:
- Lambda内でポーリング間隔500ms × 最大20回（最大10秒待ち）
- フロントエンド側で `LoadingSpinner` コンポーネントを表示
- タイムアウト時は `504` を返しフロントエンドで再試行ボタンを表示
- 個人利用（低頻度アクセス）のため追加キャッシュレイヤーは設けない

#### Lambda共通設定
- **ランタイム**: Python 3.13
- **依存管理**: `requirements.txt` → `pip install -t ./package/ -r requirements.txt` でZIPパッケージ化
- **バリデーション**: Pydantic v2 (`pydantic>=2.0`)
- **AWS SDK**: `boto3` (Lambdaランタイムに同梱済み、バージョン固定する場合は明示)
- 環境変数: `FIREHOSE_STREAM_NAME`, `ATHENA_DATABASE`, `ATHENA_TABLE`, `ATHENA_RESULT_BUCKET`
- IAMロール: Firehose PutRecord権限 + Athena実行権限 + S3結果バケット読み書き権限
- VPC: 不使用（マネージドサービスのみ利用のためVPC不要）
- X-Rayトレーシング: 有効（本番）

**デプロイフロー (GitHub Actions → S3 → Terraform)**:
```
1. GitHub Actions (deploy.yml) がトリガー
2. pip install -t ./package -r requirements.txt
3. zip -r function.zip package/ handler.py models.py
4. aws s3 cp function.zip s3://health-logger-prod-lambda-artifacts/<hash>/function.zip
5. terraform apply -var="lambda_s3_key=<hash>/function.zip"
```

**GitHub Actions ワークフロー抜粋 (`.github/workflows/deploy.yml`)**:
```yaml
- name: Build Lambda package
  run: |
    cd lambda/create_record
    pip install -t ./package -r requirements.txt
    zip -r function.zip package/ handler.py models.py

- name: Upload to S3
  run: |
    HASH=$(sha256sum function.zip | cut -d' ' -f1)
    aws s3 cp lambda/create_record/function.zip \
      s3://health-logger-prod-lambda-artifacts/${HASH}/create_record.zip
    echo "LAMBDA_HASH=${HASH}" >> $GITHUB_ENV

- name: Terraform Apply
  run: |
    cd terraform/envs/prod
    terraform apply -auto-approve \
      -var="create_record_s3_key=${LAMBDA_HASH}/create_record.zip"
```

### 3.5 Amazon Kinesis Data Firehose

#### DeliveryStream 設定

| 項目 | 設定値 |
|------|--------|
| ストリーム名 | `health-logger-prod-stream` |
| 送信先 | S3 Tables (Iceberg) |
| バッファサイズ | 5 MB |
| バッファ期間 | 60秒 |
| 圧縮 | Parquet（S3 Tables設定内包） |
| 暗号化 | SSE-S3 |
| エラー出力先 | `s3://health-logger-prod-errors/firehose/` |

#### スキーマ変換
- **Glue Schema Registry**でスキーマを管理
- JSONからParquetへの変換をFirehoseが自動実施
- スキーマ名: `health-record-schema`

**Avroスキーマ（Glue Schema Registry登録用）**:
```json
{
  "type": "record",
  "name": "HealthRecord",
  "fields": [
    { "name": "record_id",        "type": "string" },
    { "name": "user_id",          "type": "string" },
    { "name": "fatigue_score",    "type": "int" },
    { "name": "mood_score",       "type": "int" },
    { "name": "motivation_score", "type": "int" },
    { "name": "flags",            "type": "int" },
    { "name": "note",             "type": ["null", "string"], "default": null },
    { "name": "timezone",         "type": "string" },
    { "name": "app_version",      "type": "string" },
    { "name": "recorded_at",      "type": "string" },
    { "name": "server_received_at","type": "string" }
  ]
}
```

### 3.6 Amazon S3 Tables (Apache Iceberg)

#### テーブル設定

| 項目 | 設定値 |
|------|--------|
| バケット名 | `health-logger-prod-tables` |
| テーブル形式 | Apache Iceberg (S3 Tablesネイティブ) |
| テーブル名 | `health_records` |
| パーティション | `dt` (日付、`recorded_at`から導出), `user_id` |
| 保持期間 | 無期限（将来TTLポリシーで設定可） |

#### Icebergテーブルスキーマ
```sql
CREATE TABLE health_records (
  record_id        STRING,
  user_id          STRING,
  fatigue_score    INT,
  mood_score       INT,
  motivation_score INT,
  flags            INT,
  note             STRING,
  timezone         STRING,
  app_version      STRING,
  recorded_at      TIMESTAMP,
  server_received_at TIMESTAMP,
  dt               DATE   -- パーティション列
)
PARTITIONED BY (dt, user_id)
```

#### Icebergの利点（現行JSON Linesとの比較）

| 比較軸 | 現行 JSON Lines | Iceberg (S3 Tables) |
|--------|----------------|---------------------|
| クエリ性能 | 全件スキャン | プルーニング + 列指向 |
| スキーマ進化 | 手動 | ALTER TABLE対応 |
| ACID | なし | スナップショット分離 |
| 小ファイル問題 | 発生 | 自動コンパクション |
| タイムトラベル | 不可 | 可 (`FOR TIMESTAMP AS OF`) |

#### S3 Tables リスク対処方針
- **方針**: S3 Tablesで進める（検証しながら）
- Firehose → S3 Tables連携が動作しない場合のフォールバック:
  1. Firehoseの送信先を**通常S3バケット (JSON Lines)** に変更
  2. Glue Crawlerでスキーマ検出 → Athenaクエリは同様に動作
  3. 将来的にIcebergへ移行するスクリプトを別途作成
- フォールバックへの切り替えはTerraformの変数変更のみで対応できるよう設計

#### 既存データ移行
- **方針**: 移行しない（本番は新規スタート）
- ローカル開発環境（MinIO）のJSONLデータは破棄

### 3.7 Amazon Athena

#### 設定

| 項目 | 設定値 |
|------|--------|
| エンジンバージョン | Athena v3 |
| ワークグループ | `health-logger-prod` |
| 結果バケット | `s3://health-logger-prod-athena-results/` |
| 暗号化 | SSE-S3 |
| クエリ結果キャッシュ | 60分 |
| データカタログ | `AwsDataCatalog` (Glue連携) |

#### 代表的なクエリ例

```sql
-- 過去7日間のスコア推移
SELECT
  dt,
  AVG(fatigue_score)    AS avg_fatigue,
  AVG(mood_score)       AS avg_mood,
  AVG(motivation_score) AS avg_motivation
FROM health_records
WHERE user_id = '<sub>'
  AND dt >= CURRENT_DATE - INTERVAL '7' DAY
GROUP BY dt
ORDER BY dt;

-- タイムトラベル (昨日時点のデータ確認)
SELECT * FROM health_records
FOR TIMESTAMP AS OF (CURRENT_TIMESTAMP - INTERVAL '1' DAY)
WHERE user_id = '<sub>'
LIMIT 10;
```

---

## 4. PWAフロントエンド要件

現行のRails Viewに相当するフロントエンドを静的HTMLまたはSPAとして再実装する。

### 4.1 認証フロー

```
1. 未認証ユーザー → Cognito Hosted UIにリダイレクト
2. ログイン成功 → Authorization Code + PKCE でトークン取得
3. ID Token をメモリ / localStorage に保持
4. APIコール時: Authorization: Bearer <ID Token>
5. トークン期限切れ → Refresh Token で自動更新
```

### 4.2 オフライン対応 (PWA)

- Service Worker (`sw.js`) はキャッシュ戦略を継続維持
- オフライン中のPOSTはIndexedDBにキュー保存
- オンライン復帰時にトークン有効性確認後、順次リプレイ
- **注意**: Refresh Token期限切れの場合はログイン画面へ誘導

### 4.3 フロントエンド技術（確定）

- **言語**: TypeScript
- **フレームワーク**: React 18 + TypeScript
- **ビルドツール**: Vite
- **認証ライブラリ**: `@aws-amplify/auth` (Amplify v6)
- **UIライブラリ**: Bootstrap 5（現行CSSを継続利用）

**Cognito 設定初期化 (`main.tsx`)**:
```typescript
import { Amplify } from "aws-amplify";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId:       import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      loginWith: {
        oauth: {
          domain:            import.meta.env.VITE_COGNITO_DOMAIN,
          scopes:            ["openid", "email", "profile"],
          redirectSignIn:    [import.meta.env.VITE_REDIRECT_SIGN_IN],
          redirectSignOut:   [import.meta.env.VITE_REDIRECT_SIGN_OUT],
          responseType:      "code",
        },
      },
    },
  },
});
```

**認証フック (`hooks/useAuth.ts`)**:
```typescript
import { fetchAuthSession, signInWithRedirect, signOut } from "@aws-amplify/auth";

export function useAuth() {
  const getIdToken = async (): Promise<string> => {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) throw new Error("Not authenticated");
    return token;
  };
  return { getIdToken, signInWithRedirect, signOut };
}
```

---

## 5. 移行計画

### 5.1 フェーズ分割

```
Phase 1: Terraform基盤 + Cognito構築 (1〜2日)
  - prod環境のTerraform初期化 (tfstate S3バケット作成)
  - GitHub OIDC IAMロール作成
  - Cognitoユーザープール・AppClient作成 (terraform apply)
  - テストユーザーでログイン・JWTトークン取得確認

Phase 2: API Gateway + Lambda構築 (2〜3日)
  - API GW (HTTP API) + Cognitoオーソライザー作成
  - create_record Lambda (Python 3.13 + Pydantic) デプロイ
  - GitHub Actions deploy.yml でZIP→S3→terraform apply 確認
  - POST /records の疎通テスト (curl + JWT)

Phase 3: データレイク構築 (1〜2日)
  - S3 Tablesバケット + Icebergテーブル作成
  - Firehose DeliveryStream → S3 Tables 連携確認
  - ※ 連携失敗時は通常S3+JSON Linesにフォールバック
  - get_latest Lambda (Athena直接クエリ) デプロイ
  - GlueカタログへのIceberg登録・Athenaクエリ確認

Phase 4: React フロントエンド構築 (2〜3日)
  - Vite + React + TypeScript プロジェクト初期化
  - @aws-amplify/auth 組み込み・Cognito Hosted UIログイン確認
  - HealthForm.tsx (スライダー・フラグ) 実装
  - オフラインキュー (IndexedDB + SW) をTypeScriptで再実装
  - Amplify Hosting デプロイ・動作確認

Phase 5: 旧構成撤廃 (0.5日)
  - ECS / ALB / NAT GW / ECR の旧Terraformリソース削除
  - Terraform state クリーンアップ
  - MinIOローカル環境の停止
```

### 5.2 Terraform管理対象の変更

**削除するリソース**:
- `aws_ecs_cluster`, `aws_ecs_service`, `aws_ecs_task_definition`
- `aws_lb` (ALB), `aws_lb_listener`, `aws_lb_target_group`
- `aws_nat_gateway`, `aws_eip`
- `aws_ecr_repository`
- `aws_ssm_parameter` (AUTH_USERNAME/AUTH_PASSWORD)

**追加するリソース**:
- `aws_cognito_user_pool`, `aws_cognito_user_pool_client`, `aws_cognito_user_pool_domain`
- `aws_apigatewayv2_api`, `aws_apigatewayv2_authorizer`, `aws_apigatewayv2_route`
- `aws_lambda_function` × 2, `aws_lambda_permission`
- `aws_s3_bucket` (Lambda artifactsバケット: `health-logger-prod-lambda-artifacts`)
- `aws_kinesis_firehose_delivery_stream`
- `aws_glue_registry`, `aws_glue_schema`
- S3 Tables バケット (`aws_s3tables_table_bucket`, `aws_s3tables_table`)
- `aws_amplify_app`, `aws_amplify_branch`
- `aws_iam_role` (GitHub OIDC用, Lambda実行用)

### 5.3 コスト試算

| サービス | 現行 | 移行後 |
|---------|------|--------|
| コンピューティング | ECS ~¥2,000/月 | Lambda ~¥0〜100/月 |
| ロードバランサー | ALB ~¥2,500/月 | API Gateway ~¥10/月以下 |
| NAT Gateway | ~¥5,000/月 | 不要 ¥0 |
| 認証 | 無料 (Basic Auth) | Cognito ~¥0 (MAU50,000まで無料) |
| ストレージ | S3 (同一) | S3 Tables (同一) |
| **合計** | **~¥10,000/月** | **~¥500/月以下** |

---

## 6. セキュリティ要件

| 要件 | 実装方法 |
|------|---------|
| 認証 | Cognito JWT (RS256署名) |
| 通信暗号化 | TLS 1.2以上（CloudFront/API GW標準） |
| APIアクセス制御 | Cognito JWTオーソライザー (全エンドポイント) |
| データ暗号化 | S3 SSE-S3 (保存時), Firehose暗号化 |
| Lambda最小権限 | Firehose PutRecord + Athena実行のみ |
| Cognito ユーザーデータ | メールアドレスのみ保持 (個人情報最小化) |
| CORS | Amplifyドメインのみ許可 |

---

## 7. 非機能要件

| 項目 | 要件 |
|------|------|
| 可用性 | マネージドサービス標準SLA (99.9%以上) |
| レスポンスタイム | POST /records: p99 < 1秒 (Lambdaウォームアップ後) |
| スケーラビリティ | Lambda同時実行数: デフォルト制限内 (1,000並列) |
| データ保持 | 無期限 (S3 Tables) |
| バックアップ | Icebergスナップショット（自動）, S3バージョニング |
| 監視 | CloudWatch Metrics + Lambdaエラーアラーム |
| ログ | Lambda → CloudWatch Logs (30日保持) |

---

## 8. 確定済み事項一覧（要件確認完了）

すべての不確定事項が確定しました。

| 事項 | 決定内容 |
|------|---------|
| フロントエンドフレームワーク | **React + TypeScript** (Vite) |
| フロントエンド配信 | **Amplify Hosting** |
| GET /records/latest | **Athena直接クエリ** + ローディングスピナーでUX対処 |
| Cognitoドメイン | **デフォルトドメイン** (auth.ap-northeast-1.amazoncognito.com) |
| MFA | **オプション** (TOTP、ユーザー任意設定) |
| S3 Tables リスク | **S3 Tablesで進める**（失敗時は通常S3+JSON Linesにフォールバック） |
| 既存データ移行 | **移行しない**（本番は新規スタート） |
| AWS環境 | **prod のみ**（dev環境は構築しない） |
| Lambdaデプロイ | **GitHub Actions** (ZIP→S3→terraform apply) |

---

---

## 9. 言語・ランタイム選定理由

### Python (Lambda)
- データ処理・分析系ライブラリ（pandas, polars）の将来追加に有利
- Pydantic v2 による型安全なバリデーションが boto3 との相性良好
- Athena結果の加工処理が複雑化した際に対応しやすい
- コールドスタートは Node.js より若干遅いが、個人利用の頻度では問題なし

### TypeScript (フロントエンド)
- 既存の Bootstrap 5 HTML/CSS を流用しつつ、型安全な API クライアントを実装可能
- `HealthRecordInput` 型をフロントエンドとバックエンド間の契約として活用
- Service Worker・IndexedDB のオフラインキューを型安全に実装可能
- Amplify Hosting のビルドパイプラインと親和性が高い

---

*以上が移行要件定義書の全内容です（v1.2 — 全不確定事項確定済み）。Phase 1から順次実装を開始できます。*
