# =============================================================================
# dbt Docker イメージ (multi-stage)
#
# ステージ:
#   base  - 共通依存関係 (dev/prod 共用)
#   dev   - 開発用: sleep infinity で常駐 (docker-compose.dbt.yml が参照)
#   prod  - 本番用: dbt プロジェクトを内包、ECR push 対象
#
# ビルド:
#   dev:  docker build --target dev  -f docker/dbt/Dockerfile .
#   prod: docker build --target prod -f docker/dbt/Dockerfile .
#         docker build               -f docker/dbt/Dockerfile .  (デフォルトは prod)
#
# 依存バージョンの変更: requirements/dbt.txt のみ編集する
# =============================================================================

ARG PYTHON_VERSION=3.12

# -----------------------------------------------------------------------------
# base: 共通依存関係
# requirements/dbt.txt からインストール (devcontainer と同じファイルを使用)
# -----------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ git curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/dbt.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /tmp/requirements.txt

RUN mkdir -p /root/.dbt

ENV DBT_PROFILES_DIR=/root/.dbt
ENV PYTHONUNBUFFERED=1

# -----------------------------------------------------------------------------
# dev: 開発用ステージ
# docker-compose.dbt.yml から参照。sleep infinity で常駐し docker exec で操作。
# data/dbt/ はボリュームマウントで渡す (ホット編集可能)
# -----------------------------------------------------------------------------
FROM base AS dev

WORKDIR /workspace

ENV DBT_PROJECT_DIR=/workspace

CMD ["sleep", "infinity"]

# -----------------------------------------------------------------------------
# prod: 本番実行用ステージ (ECR push 対象)
# dbt プロジェクトをイメージに内包。ECS / StepFunctions / Batch から実行する。
# profiles.yml はシークレットボリュームまたは SSM 経由でマウントする。
# -----------------------------------------------------------------------------
FROM base AS prod

WORKDIR /app

# dbt プロジェクトをイメージに埋め込む
COPY data/dbt/ /app/dbt/

COPY docker/dbt/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DBT_PROJECT_DIR=/app/dbt

ENTRYPOINT ["/entrypoint.sh"]

# デフォルトコマンド: ECS タスク定義 / StepFunctions から上書き可能
# 例: ["run", "--select", "+fct_health_env_joined_hourly"]
#     ["test", "--select", "staging"]
CMD ["run", "--profiles-dir", "/root/.dbt"]
