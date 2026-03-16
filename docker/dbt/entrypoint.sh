#!/bin/sh
# =============================================================================
# dbt 本番実行エントリポイント
#
# ECS タスク / StepFunctions / Batch からコンテナの CMD を上書きして使う。
#
# 例 (ECS タスク定義 command):
#   ["run", "--profiles-dir", "/root/.dbt"]
#   ["run", "--select", "+fct_health_env_joined_hourly"]
#   ["test", "--select", "staging"]
#   ["docs", "generate"]
#
# 環境変数:
#   DBT_PROJECT_DIR   dbt プロジェクトルート (default: /app/dbt)
#   DBT_PROFILES_DIR  profiles.yml ディレクトリ (default: /root/.dbt)
# =============================================================================

set -e

echo "[dbt] DBT_PROJECT_DIR=${DBT_PROJECT_DIR}"
echo "[dbt] DBT_PROFILES_DIR=${DBT_PROFILES_DIR}"
echo "[dbt] command: dbt $*"

if [ ! -f "${DBT_PROJECT_DIR}/dbt_project.yml" ]; then
    echo "[dbt] ERROR: dbt_project.yml not found at ${DBT_PROJECT_DIR}"
    exit 1
fi

if [ ! -f "${DBT_PROFILES_DIR}/profiles.yml" ]; then
    echo "[dbt] ERROR: profiles.yml not found at ${DBT_PROFILES_DIR}"
    echo "[dbt]        ECS タスク定義でシークレットボリュームをマウントしてください"
    echo "[dbt]        例: SSM Parameter Store → /root/.dbt/profiles.yml"
    exit 1
fi

cd "${DBT_PROJECT_DIR}"

# dbt_packages がなければ自動インストール
if [ ! -d "dbt_packages" ]; then
    echo "[dbt] Running dbt deps..."
    dbt deps --profiles-dir "${DBT_PROFILES_DIR}"
fi

exec dbt "$@"
