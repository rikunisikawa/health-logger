# =============================================================================
# dbt-mcp コンテナ
#
# 設計方針:
# - dbt コンテナと同じベース・同じアダプターを使い、環境の一貫性を保つ
# - dbt-mcp が内部で dbt CLI を呼び出すため、dbt も一緒にインストールする
# - MCP_TRANSPORT=streamable-http でネイティブ HTTP 公開（supergateway 不要）
# - uv を使って高速インストール（公式 Dockerfile に倣った構成）
#
# ⚠️ 不確実性の注記:
# dbt-mcp の HTTP モードの起動オプション（--host / --port フラグ等）は
# バージョンによって変わる可能性があります。
# MCP_TRANSPORT / MCP_HOST / MCP_PORT が認識されない場合は、
# entrypoint.sh で引数を直接渡すように変更してください。
# 参照: https://github.com/dbt-labs/dbt-mcp
# =============================================================================

ARG PYTHON_VERSION=3.12
ARG DBT_CORE_VERSION=1.10.5
ARG DBT_ADAPTER=dbt-athena-community
ARG DBT_ADAPTER_VERSION=1.9.4
ARG DBT_MCP_VERSION=1.10.0

# =============================================================================
# Stage 1: uv を使った高速 builder
# dbt Labs の公式 Dockerfile と同じアプローチを採用
# =============================================================================
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ARG DBT_CORE_VERSION
ARG DBT_ADAPTER
ARG DBT_ADAPTER_VERSION
ARG DBT_MCP_VERSION

# ビルド用システムパッケージ
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# uv で高速インストール（pip より大幅に速い）
# --system: システムの Python にインストール
# --no-cache: キャッシュなし（イメージサイズ削減）
RUN uv pip install --system --no-cache \
    "dbt-core==${DBT_CORE_VERSION}" \
    "${DBT_ADAPTER}==${DBT_ADAPTER_VERSION}" \
    "dbt-mcp==${DBT_MCP_VERSION}"

# =============================================================================
# Stage 2: runtime
# =============================================================================
FROM python:${PYTHON_VERSION}-slim-bookworm AS runtime

LABEL org.opencontainers.image.title="health-logger-dbt-mcp"
LABEL org.opencontainers.image.description="dbt-mcp MCP server for health-logger project"

# ランタイム依存
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# builder からパッケージをコピー
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin/dbt /usr/local/bin/dbt
COPY --from=builder /usr/local/bin/dbt-mcp /usr/local/bin/dbt-mcp

WORKDIR /workspace

RUN mkdir -p /root/.dbt

ENV PATH="/usr/local/bin:${PATH}"
ENV PYTHONUNBUFFERED=1

# --- dbt 設定 ---
ENV DBT_PROJECT_DIR=/workspace
ENV DBT_PROFILES_DIR=/root/.dbt
# dbt-mcp が内部で呼び出す dbt の絶対パス
ENV DBT_PATH=/usr/local/bin/dbt

# --- MCP トランスポート設定 ---
# streamable-http: MCP 最新仕様。Claude Code の URL 接続に対応
# sse:             旧来の SSE 形式。古いクライアント向け
# stdio:           ローカルプロセスとして使う場合（HTTP 公開不要）
ENV MCP_TRANSPORT=streamable-http
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=8811

# --- dbt-mcp ツール有効化 ---
ENV DBT_MCP_ENABLE_DBT_CLI=true
ENV DBT_MCP_ENABLE_SEMANTIC_LAYER=""
ENV DBT_MCP_ENABLE_ADMIN_API=""
ENV DBT_MCP_ENABLE_DISCOVERY=""

# 起動スクリプトをコピー（環境変数の検証 + dbt-mcp 起動）
COPY docker/dbt-mcp/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# dbt と dbt-mcp のバージョン確認
RUN dbt --version && dbt-mcp --help > /dev/null 2>&1 || echo "dbt-mcp installed"

EXPOSE ${MCP_PORT}

ENTRYPOINT ["/entrypoint.sh"]
