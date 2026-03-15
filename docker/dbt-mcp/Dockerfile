ARG PYTHON_VERSION=3.12
ARG DBT_CORE_VERSION=1.10.5
ARG DBT_ADAPTER=dbt-athena-community
ARG DBT_ADAPTER_VERSION=1.9.4
ARG DBT_MCP_VERSION=1.10.0

FROM python:${PYTHON_VERSION}-slim

ARG DBT_CORE_VERSION
ARG DBT_ADAPTER
ARG DBT_ADAPTER_VERSION
ARG DBT_MCP_VERSION

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ git curl socat \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
      "dbt-core==${DBT_CORE_VERSION}" \
      "${DBT_ADAPTER}==${DBT_ADAPTER_VERSION}" \
      "dbt-mcp==${DBT_MCP_VERSION}"

WORKDIR /workspace
RUN mkdir -p /root/.dbt

ENV DBT_PROJECT_DIR=/workspace
ENV DBT_PROFILES_DIR=/root/.dbt
ENV DBT_PATH=/usr/local/bin/dbt
ENV MCP_TRANSPORT=streamable-http
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=8811
ENV DBT_MCP_ENABLE_DBT_CLI=true
ENV PYTHONUNBUFFERED=1

COPY docker/dbt-mcp/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8811

ENTRYPOINT ["/entrypoint.sh"]
