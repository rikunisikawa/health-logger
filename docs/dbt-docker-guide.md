# dbt + dbt-mcp Docker Sidecar 構成ガイド

## 1. 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│  ホスト（WSL2 / macOS / Linux）                              │
│                                                             │
│  Claude Code / Cursor / VS Code                             │
│       │                                                     │
│       │ HTTP (localhost:8811)                               │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────┐           │
│  │  Docker Compose ネットワーク (dbt-net)        │           │
│  │                                             │           │
│  │  ┌──────────────┐   ┌──────────────────┐   │           │
│  │  │   dbt        │   │   dbt-mcp        │   │           │
│  │  │  (CLI用)     │   │  (MCPサーバー)   │   │           │
│  │  │              │   │                  │   │           │
│  │  │ sleep ∞      │   │ MCP_TRANSPORT=   │   │           │
│  │  │              │   │ streamable-http  │   │           │
│  │  │ docker exec  │   │ :8811            │   │           │
│  │  │ で dbt run   │   │                  │   │           │
│  │  └──────┬───────┘   └────────┬─────────┘   │           │
│  │         │                   │             │           │
│  │         └─────────┬─────────┘             │           │
│  │                   │ 共有ボリューム          │           │
│  └───────────────────┼─────────────────────────┘           │
│                      │                                     │
│  ┌───────────────────▼───────────────────────┐             │
│  │  ボリューム                                │             │
│  │  ./data/dbt      → /workspace             │             │
│  │  ./data/dbt/profiles → /root/.dbt         │             │
│  │  dbt-target (named) → /workspace/target   │             │
│  └────────────────────────────────────────────┘             │
│                                                             │
│                      │ Athena / DWH                        │
│                      ▼                                     │
│              AWS Athena（または他DWH）                       │
└─────────────────────────────────────────────────────────────┘
```

### この構成が嬉しい理由

| 課題 | この構成での解決 |
|---|---|
| ホストに dbt をインストールしたくない | コンテナ内に閉じ込め、ホストは汚さない |
| DWH を切り替えたい | `DBT_ADAPTER` 変数を変えてリビルドするだけ |
| AI エージェントから dbt を操作したい | dbt-mcp が HTTP で常時待ち受け |
| manifest.json を両コンテナで共有したい | named volume `dbt-target` で共有 |
| 認証情報をコードに書きたくない | `.env` + `.gitignore` で管理 |
| devcontainer 化したい | `/workspace` パスに統一済みで移行しやすい |

---

## 2. ディレクトリ構成

```
(project root)/
├── docker-compose.dbt.yml          # sidecar compose 定義
├── docker/
│   ├── dbt/
│   │   └── Dockerfile              # dbt CLI コンテナ（マルチステージ・軽量）
│   └── dbt-mcp/
│       ├── Dockerfile              # dbt-mcp コンテナ（uv ベース）
│       └── entrypoint.sh           # 起動前検証 + dbt-mcp 起動
└── data/dbt/
    ├── .env.example                # 環境変数テンプレート（コミット済み）
    ├── .env                        # 実際の環境変数（.gitignore済み）
    ├── profiles/
    │   ├── profiles.yml.example    # profiles テンプレート（コミット済み）
    │   └── profiles.yml            # 実際の接続情報（.gitignore済み）
    ├── dbt_project.yml
    ├── models/
    ├── macros/
    ├── seeds/
    ├── snapshots/
    ├── tests/
    ├── analyses/
    └── docs/
```

---

## 3. 初期セットアップ手順

### Step 1: 環境変数ファイルの作成

```bash
cd /path/to/health-logger

# .env を作成して編集
cp data/dbt/.env.example data/dbt/.env
# エディタで AWS 認証情報等を設定
```

### Step 2: profiles.yml の作成

```bash
cp data/dbt/profiles/profiles.yml.example data/dbt/profiles/profiles.yml
# エディタで DWH 接続情報を設定
```

### Step 3: イメージのビルド

```bash
# 初回 or Dockerfile 変更時
docker compose -f docker-compose.dbt.yml build

# アダプターを変更する場合（例: BigQuery に切り替え）
DBT_ADAPTER=dbt-bigquery DBT_ADAPTER_VERSION=1.9.0 \
  docker compose -f docker-compose.dbt.yml build
```

### Step 4: 起動

```bash
# 推奨構成（dbt + dbt-mcp）
docker compose -f docker-compose.dbt.yml up -d

# 最小構成（dbt CLI のみ）
docker compose -f docker-compose.dbt.yml up -d dbt
```

---

## 4. 起動確認コマンド

```bash
# コンテナの状態確認
docker compose -f docker-compose.dbt.yml ps

# dbt バージョン確認
docker compose -f docker-compose.dbt.yml exec dbt dbt --version

# dbt 接続確認（profiles.yml が正しく設定されているか）
docker compose -f docker-compose.dbt.yml exec dbt dbt debug

# dbt パッケージインストール（dbt_utils など）
docker compose -f docker-compose.dbt.yml exec dbt dbt deps

# dbt-mcp ログ確認
docker compose -f docker-compose.dbt.yml logs dbt-mcp

# MCP サーバーの応答確認
curl http://localhost:8811/health 2>/dev/null || \
  echo "※ /health エンドポイントがない場合は /mcp にアクセスしてください"

# よく使う dbt コマンド
docker compose -f docker-compose.dbt.yml exec dbt dbt run
docker compose -f docker-compose.dbt.yml exec dbt dbt test
docker compose -f docker-compose.dbt.yml exec dbt dbt build
docker compose -f docker-compose.dbt.yml exec dbt dbt source freshness
docker compose -f docker-compose.dbt.yml exec dbt dbt docs generate

# フルリビルド（incremental を最初から作り直す場合）
docker compose -f docker-compose.dbt.yml exec dbt dbt run --full-refresh
```

---

## 5. Claude Code への MCP 設定

`dbt-mcp` コンテナが起動したら、Claude Code の MCP 設定に追加します。

### `.mcp.json`（プロジェクトルートに配置）

```json
{
  "mcpServers": {
    "dbt": {
      "type": "http",
      "url": "http://localhost:8811/mcp"
    }
  }
}
```

> **SSE の場合:** `"url": "http://localhost:8811/sse"` に変更

設定後、Claude Code を再起動すると dbt ツールが使えるようになります。

使用例:
- 「`stg_env__hourly` を実行して」→ `dbt run --select stg_env__hourly`
- 「全テストを実行して」→ `dbt test`
- 「source の鮮度を確認して」→ `dbt source freshness`

---

## 6. 最小構成版 vs 推奨構成版

### 最小構成版（dbt CLI のみ）

```yaml
# docker-compose.dbt.minimal.yml（参考）
services:
  dbt:
    build:
      context: .
      dockerfile: docker/dbt/Dockerfile
    volumes:
      - ./data/dbt:/workspace
      - ./data/dbt/profiles:/root/.dbt
    command: sleep infinity
    env_file:
      - path: ./data/dbt/.env
        required: false
```

**メリット:** シンプル・起動が速い
**デメリット:** AI エージェントから操作できない

### 推奨構成版（dbt + dbt-mcp sidecar）

`docker-compose.dbt.yml` がそのまま推奨構成です。

**メリット:** Claude Code / Cursor から自然言語で dbt を操作できる
**デメリット:** コンテナが2つになる・ビルド時間が増える

---

## 7. DWH アダプターの差し替え方

```bash
# .env の DBT_ADAPTER を変更して再ビルド
# 例: PostgreSQL に切り替える
cat >> data/dbt/.env << 'EOF'
DBT_ADAPTER=dbt-postgres
DBT_ADAPTER_VERSION=1.9.0
EOF

docker compose -f docker-compose.dbt.yml build --no-cache
docker compose -f docker-compose.dbt.yml up -d

# profiles.yml の target も変更する（dbt-postgres 向けの接続情報に）
```

| アダプター | パッケージ名 | バージョン例 |
|---|---|---|
| Amazon Athena | `dbt-athena-community` | 1.9.4 |
| PostgreSQL / Aurora | `dbt-postgres` | 1.9.0 |
| Google BigQuery | `dbt-bigquery` | 1.9.0 |
| Snowflake | `dbt-snowflake` | 1.9.0 |
| Amazon Redshift | `dbt-redshift` | 1.9.0 |
| DuckDB（ローカル完結） | `dbt-duckdb` | 1.9.0 |

---

## 8. トラブルシュート

### profiles.yml が見つからない

```
RuntimeError: Could not find profile named 'health_logger'
```

→ `data/dbt/profiles/profiles.yml` が存在するか確認:

```bash
ls -la data/dbt/profiles/
# profiles.yml がなければ
cp data/dbt/profiles/profiles.yml.example data/dbt/profiles/profiles.yml
```

### AWS 認証エラー（Athena）

```
botocore.exceptions.NoCredentialsError: Unable to locate credentials
```

→ `data/dbt/.env` の AWS 設定を確認。または `~/.aws/credentials` をコンテナにマウント:

```yaml
# docker-compose.dbt.yml の dbt サービスに追加
volumes:
  - ~/.aws:/root/.aws:ro   # ホストの AWS 設定を読み取り専用でマウント
```

### dbt-mcp が起動しない

```bash
# ログを確認
docker compose -f docker-compose.dbt.yml logs dbt-mcp

# コンテナに入って手動で起動を試みる
docker compose -f docker-compose.dbt.yml run --rm --entrypoint sh dbt-mcp
# コンテナ内で:
dbt-mcp --help
MCP_TRANSPORT=streamable-http dbt-mcp
```

### MCP_PORT 8811 が既に使われている

```bash
# 使用ポートを変更（.env で指定）
echo "MCP_PORT=8812" >> data/dbt/.env
docker compose -f docker-compose.dbt.yml up -d
```

### dbt-target volume が古い

```bash
# named volume を削除して再作成
docker compose -f docker-compose.dbt.yml down -v
docker compose -f docker-compose.dbt.yml up -d
```

### Windows (WSL2) でのパス問題

WSL2 ではホストの Windows パス（`C:\...`）を Docker にマウントできません。
プロジェクトは必ず WSL2 のファイルシステム上（`/home/...` や `/mnt/...` ではない場所）に置いてください。

---

## 9. 将来拡張のポイント

### devcontainer 化

`/workspace` に統一しているため、以下を追加するだけで devcontainer として使えます:

```json
// .devcontainer/devcontainer.json
{
  "name": "health-logger dbt",
  "dockerComposeFile": ["../docker-compose.dbt.yml"],
  "service": "dbt",
  "workspaceFolder": "/workspace",
  "extensions": [
    "innoverio.vscode-dbt-power-user",
    "dbt-labs.dbt-power-user"
  ]
}
```

### CI/CD 組み込み

```yaml
# .github/workflows/dbt.yml
jobs:
  dbt:
    steps:
      - uses: actions/checkout@v4
      - name: dbt build
        run: |
          cp data/dbt/profiles/profiles.yml.example data/dbt/profiles/profiles.yml
          docker compose -f docker-compose.dbt.yml run --rm dbt \
            sh -c "dbt deps && dbt build"
        env:
          AWS_REGION: ap-northeast-1
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

### postgres サービスの追加（ローカル完結開発）

```yaml
# docker-compose.dbt.yml に追加
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: health_logger
      POSTGRES_USER: dbt
      POSTGRES_PASSWORD: dbt
    networks:
      - dbt-net
```

### dbt-mcp の stdio モードへの切り替え（Claude Desktop 用）

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "dbt": {
      "command": "docker",
      "args": [
        "compose", "-f", "/path/to/docker-compose.dbt.yml",
        "run", "--rm", "-e", "MCP_TRANSPORT=stdio", "dbt-mcp"
      ]
    }
  }
}
```
