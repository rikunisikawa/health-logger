#!/usr/bin/env bash
# ============================================================
# automation/run_cycle.sh
# 開発サイクルのエントリポイント（cron から呼び出す）
#
# 使い方:
#   bash automation/run_cycle.sh                    # 通常実行
#   bash automation/run_cycle.sh --dry-run          # 動作確認
#   bash automation/run_cycle.sh --model sonnet     # モデル指定
#
# cron 設定例（毎週月曜 AM 9:00）:
#   0 9 * * 1 cd ~/dev/health-logger/health-logger && bash automation/run_cycle.sh >> /tmp/dev-cycle.log 2>&1
# ============================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PREFIX="[dev-cycle $(date '+%Y-%m-%d %H:%M:%S')]"

# 引数をそのまま orchestrator.py に渡す
ARGS="$@"

echo "$LOG_PREFIX 開発サイクル開始"
echo "$LOG_PREFIX リポジトリ: $REPO_ROOT"

cd "$REPO_ROOT"

# 依存チェック
if ! command -v python3 &>/dev/null; then
  echo "$LOG_PREFIX ERROR: python3 が見つかりません" >&2; exit 1
fi
if ! python3 -c "import yaml" 2>/dev/null; then
  echo "$LOG_PREFIX pyyaml をインストールします..."
  pip install pyyaml --quiet
fi

# オーケストレーター実行
python3 automation/orchestrator.py $ARGS

# サイクル完了後に explainer を実行
echo "$LOG_PREFIX explainer を実行します..."
python3 automation/explainer.py

# pptx 生成（python-pptx がある場合のみ）
LATEST_JSON="$(ls -t docs/explain/*.json 2>/dev/null | head -1 || echo '')"
if [[ -n "$LATEST_JSON" ]]; then
  if python3 -c "import pptx" 2>/dev/null; then
    echo "$LOG_PREFIX PowerPoint を生成します: $LATEST_JSON"
    python3 automation/generate_pptx.py "$LATEST_JSON"
  else
    echo "$LOG_PREFIX INFO: python-pptx 未インストールのため pptx 生成をスキップ"
    echo "$LOG_PREFIX       インストール: pip install python-pptx"
  fi
fi

echo "$LOG_PREFIX 完了"
