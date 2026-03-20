#!/bin/bash
# Docker 経由で dbt を実行するラッパースクリプト
#
# 用途:
#   - ホスト環境からターミナルで手動実行する場合
#   - CI で Docker コンテナ内の dbt を呼び出す場合
#
# dbt Power User (VS Code拡張) からの呼び出しは devcontainer 内で
# native dbt (/usr/local/bin/dbt) を直接使うため、このスクリプトは不要。
#
# 使い方:
#   ./scripts/dbt.sh run --select staging
#   ./scripts/dbt.sh test
#   ./scripts/dbt.sh docs generate   # catalog.json + manifest.json + index.html を生成
#   ./scripts/dbt.sh docs serve      # http://localhost:8080 でドキュメントサイトを起動

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.dbt.yml"

_ensure_dbt_running() {
  if ! docker compose -f "${COMPOSE_FILE}" ps dbt --status running 2>/dev/null | grep -q "running"; then
    echo "[dbt-wrapper] dbt コンテナが起動していません。起動します..." >&2
    docker compose -f "${COMPOSE_FILE}" up -d dbt >&2
    sleep 5
  fi
}

# docs サブコマンドの処理
# 使い方:
#   ./scripts/dbt.sh docs generate  → catalog.json + manifest.json + index.html を生成
#   ./scripts/dbt.sh docs serve     → http://localhost:8080 でドキュメントサイトを起動
if [[ "$1" == "docs" ]]; then
  DOCS_CMD="${2:-generate}"
  shift 2 2>/dev/null || shift 1

  _ensure_dbt_running

  case "${DOCS_CMD}" in
    generate)
      echo "[dbt-docs] ドキュメントを生成します..." >&2
      exec docker compose -f "${COMPOSE_FILE}" exec -T dbt dbt docs generate "$@"
      ;;
    serve)
      echo "[dbt-docs] http://localhost:8080 でドキュメントサイトを起動します..." >&2
      echo "[dbt-docs] 停止するには Ctrl+C を押してください。" >&2
      exec docker compose -f "${COMPOSE_FILE}" exec dbt dbt docs serve --host 0.0.0.0 --port 8080 "$@"
      ;;
    *)
      echo "Usage: $0 docs [generate|serve]" >&2
      exit 1
      ;;
  esac
fi

_ensure_dbt_running

# コンテナ内の dbt を実行（引数をそのまま渡す）
exec docker compose -f "${COMPOSE_FILE}" exec -T dbt dbt "$@"
