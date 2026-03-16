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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.dbt.yml"

# dbt コンテナが起動していなければ起動する
if ! docker compose -f "${COMPOSE_FILE}" ps dbt --status running 2>/dev/null | grep -q "running"; then
  echo "[dbt-wrapper] dbt コンテナが起動していません。起動します..." >&2
  docker compose -f "${COMPOSE_FILE}" up -d dbt >&2
  sleep 5
fi

# コンテナ内の dbt を実行（引数をそのまま渡す）
exec docker compose -f "${COMPOSE_FILE}" exec -T dbt dbt "$@"
