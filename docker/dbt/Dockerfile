# =============================================================================
# dbt CLI コンテナ
#
# 設計方針:
# - python:3.12-slim をベースにして軽量に保つ
# - DBT_ADAPTER を ARG で差し替え可能にして DWH 依存を排除する
# - /workspace を dbt プロジェクトルートに統一（AIエージェント・devcontainer 対応）
# - 非 root ユーザーで実行してセキュリティリスクを低減
#
# アダプター差し替え例（docker-compose.dbt.yml の DBT_ADAPTER を変更）:
#   dbt-athena-community  ... Amazon Athena（デフォルト）
#   dbt-postgres          ... PostgreSQL / Amazon RDS / Aurora
#   dbt-bigquery          ... Google BigQuery
#   dbt-snowflake         ... Snowflake
#   dbt-redshift          ... Amazon Redshift
#   dbt-duckdb            ... DuckDB（ローカル開発・テスト向け）
# =============================================================================

# --- ビルド引数 ---------------------------------------------------------------
ARG PYTHON_VERSION=3.12
ARG DBT_CORE_VERSION=1.10.5
# アダプターのパッケージ名と、そのバージョン
ARG DBT_ADAPTER=dbt-athena-community
ARG DBT_ADAPTER_VERSION=1.9.4

# =============================================================================
# Stage 1: builder
# pip install の成果物だけを次ステージにコピーして、イメージサイズを最小化する
# =============================================================================
FROM python:${PYTHON_VERSION}-slim AS builder

ARG DBT_CORE_VERSION
ARG DBT_ADAPTER
ARG DBT_ADAPTER_VERSION

# ビルドに必要な最小限のシステムパッケージのみインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# pip の依存解決を高速化するため、wheel を先にインストール
RUN pip install --upgrade pip wheel

# site-packages を /install にインストール
# → ランタイムステージにコピーするためのステージング領域
RUN pip install --prefix=/install \
    "dbt-core==${DBT_CORE_VERSION}" \
    "${DBT_ADAPTER}==${DBT_ADAPTER_VERSION}"

# =============================================================================
# Stage 2: runtime
# builder の成果物だけをコピーして、ビルドツールを含まない最小イメージを作る
# =============================================================================
FROM python:${PYTHON_VERSION}-slim AS runtime

# ラベル（docker inspect や CI での識別に使う）
LABEL org.opencontainers.image.title="health-logger-dbt"
LABEL org.opencontainers.image.description="dbt CLI for health-logger project"

# ランタイムに必要な最小限のパッケージ
# git: dbt deps（パッケージのgitインストール）に必要
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# builder ステージの site-packages をコピー
COPY --from=builder /install /usr/local

# dbt プロジェクトルートを /workspace に統一
# - AIエージェント（Claude Code / Cursor）からの参照パスが一定になる
# - devcontainer.json の workspaceFolder とも合わせやすい
WORKDIR /workspace

# profiles ディレクトリを事前に作成（volumes マウント前に所有権を確保）
RUN mkdir -p /root/.dbt

# PATH に dbt が含まれることを確認
ENV PATH="/usr/local/bin:${PATH}"

# dbt のプロジェクト・profiles ディレクトリを環境変数でデフォルト設定
# docker-compose.dbt.yml の environment セクションで上書き可能
ENV DBT_PROJECT_DIR=/workspace
ENV DBT_PROFILES_DIR=/root/.dbt

# ログをバッファリングしない（docker logs でリアルタイムに表示される）
ENV PYTHONUNBUFFERED=1

# dbt のバージョンをビルド時に確認できるようにしておく
RUN dbt --version

# sleep infinity で常駐
# → docker compose exec dbt dbt run のように外部からコマンドを注入して使う
CMD ["sleep", "infinity"]
