#!/bin/sh
# =============================================================================
# dbt-mcp 起動スクリプト
#
# 役割:
# 1. 必要な環境変数の検証
# 2. dbt project の存在確認
# 3. dbt-mcp を適切なトランスポートで起動
#
# ⚠️ dbt-mcp の HTTP 起動オプションはバージョンで変わる可能性があります。
#    v1.10.0 時点では MCP_TRANSPORT 環境変数で制御できます。
#    もし `dbt-mcp --transport` のような CLI フラグが必要になった場合は
#    このスクリプトを修正してください。
# =============================================================================

set -e

echo "[dbt-mcp] Starting..."
echo "[dbt-mcp] Transport:    ${MCP_TRANSPORT}"
echo "[dbt-mcp] Host:         ${MCP_HOST}"
echo "[dbt-mcp] Port:         ${MCP_PORT}"
echo "[dbt-mcp] Project dir:  ${DBT_PROJECT_DIR}"
echo "[dbt-mcp] Profiles dir: ${DBT_PROFILES_DIR}"
echo "[dbt-mcp] dbt path:     ${DBT_PATH}"

# --- 必須ファイルの存在確認 ---
if [ ! -f "${DBT_PROJECT_DIR}/dbt_project.yml" ]; then
  echo "[dbt-mcp] ERROR: dbt_project.yml not found at ${DBT_PROJECT_DIR}"
  echo "[dbt-mcp]        Volume マウントの設定を確認してください。"
  exit 1
fi

if [ ! -f "${DBT_PROFILES_DIR}/profiles.yml" ]; then
  echo "[dbt-mcp] WARNING: profiles.yml not found at ${DBT_PROFILES_DIR}"
  echo "[dbt-mcp]          data/dbt/profiles/profiles.yml を作成してください。"
  echo "[dbt-mcp]          data/dbt/profiles.yml.example を参考にしてください。"
  echo "[dbt-mcp]          profiles.yml なしで起動を続けます（接続エラーになる可能性あり）。"
fi

# --- dbt パッケージのインストール確認 ---
if [ ! -d "${DBT_PROJECT_DIR}/dbt_packages" ]; then
  echo "[dbt-mcp] INFO: dbt_packages not found. Running dbt deps..."
  cd "${DBT_PROJECT_DIR}" && dbt deps --profiles-dir "${DBT_PROFILES_DIR}" || \
    echo "[dbt-mcp] WARNING: dbt deps failed. Continuing anyway."
fi

# --- dbt-mcp 起動 ---
# MCP_TRANSPORT 環境変数は dbt-mcp が内部で参照する
# streamable-http / sse / stdio のいずれかを指定
echo "[dbt-mcp] Launching dbt-mcp server..."
exec dbt-mcp
