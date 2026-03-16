# =============================================================================
# Dev Container Dockerfile
# 開発環境専用。本番デプロイには使用しない。
#
# 含むツール:
#   - Python 3.12  (Lambda テスト / dbt)
#   - dbt CLI      (dbt Power User が直接呼び出す)
#   - Terraform    (インフラ変更)
#   - AWS CLI v2   (デプロイ・確認)
#   - Node.js      (frontend npm run dev / build)
# =============================================================================

ARG PYTHON_VERSION=3.12
ARG TERRAFORM_VERSION=1.7.5
ARG NODE_VERSION=20

FROM python:${PYTHON_VERSION}-slim

ARG TERRAFORM_VERSION
ARG NODE_VERSION

# 基本パッケージ
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git unzip gnupg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Terraform CLI
# -----------------------------------------------------------------------------
RUN curl -fsSL \
    "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" \
    -o /tmp/terraform.zip \
    && unzip /tmp/terraform.zip -d /usr/local/bin/ \
    && rm /tmp/terraform.zip \
    && terraform version

# -----------------------------------------------------------------------------
# AWS CLI v2
# -----------------------------------------------------------------------------
RUN curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" \
    -o /tmp/awscliv2.zip \
    && unzip /tmp/awscliv2.zip -d /tmp/ \
    && /tmp/aws/install \
    && rm -rf /tmp/aws /tmp/awscliv2.zip \
    && aws --version

# -----------------------------------------------------------------------------
# Node.js (frontend 開発用)
# -----------------------------------------------------------------------------
RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node --version && npm --version

# -----------------------------------------------------------------------------
# Python 依存関係 (dbt + 開発ツール)
# requirements/dbt.txt は docker/dbt/Dockerfile と共用
# -----------------------------------------------------------------------------
# dev.txt が -r dbt.txt を参照するため、両ファイルを同じディレクトリにコピーする
COPY requirements/dbt.txt /tmp/dbt.txt
COPY requirements/dev.txt /tmp/requirements-dev.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /tmp/requirements-dev.txt

WORKDIR /workspace
