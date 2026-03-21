#!/usr/bin/env bash
# ============================================================
# scripts/run-dev-env-review.sh
# Claude Code 開発環境レビューを非インタラクティブ実行するスクリプト
#
# 使い方:
#   bash scripts/run-dev-env-review.sh           # 通常実行
#   bash scripts/run-dev-env-review.sh --dry-run # コミットせず確認のみ
#   bash scripts/run-dev-env-review.sh --model haiku  # モデル指定
#
# 定期実行設定 (cron 例 - 毎月1日 AM 9:00):
#   0 9 1 * * cd /path/to/repo && bash scripts/run-dev-env-review.sh >> /tmp/dev-env-review.log 2>&1
#
# 定期実行設定 (launchd - macOS 推奨):
#   scripts/com.health-logger.dev-env-review.plist を参照
# ============================================================

set -euo pipefail

# ── 設定 ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPT_FILE="$REPO_ROOT/.claude/prompts/dev-env-review.md"
OUTPUT_FILE="$REPO_ROOT/docs/claude-code-dev-env-review.md"
LOG_PREFIX="[dev-env-review $(date '+%Y-%m-%d %H:%M:%S')]"

# デフォルト設定
MODEL="${MODEL:-sonnet}"  # haiku / sonnet / opus
DRY_RUN=false

# ── 引数パース ───────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)    DRY_RUN=true; shift ;;
    --model)      MODEL="$2"; shift 2 ;;
    --model=*)    MODEL="${1#*=}"; shift ;;
    -h|--help)
      sed -n '3,14p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── 前提チェック ─────────────────────────────────────────────
echo "$LOG_PREFIX 開始"

if ! command -v claude &>/dev/null; then
  echo "$LOG_PREFIX ERROR: claude コマンドが見つかりません。Claude Code をインストールしてください。" >&2
  echo "$LOG_PREFIX  → https://docs.anthropic.com/en/docs/claude-code/overview" >&2
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "$LOG_PREFIX ERROR: プロンプトファイルが見つかりません: $PROMPT_FILE" >&2
  exit 1
fi

cd "$REPO_ROOT"

# git の作業ツリーが clean かチェック（レビュー前のスナップショット用）
GIT_STATUS="$(git status --porcelain)"

# ── Claude Code 実行 ─────────────────────────────────────────
echo "$LOG_PREFIX Claude Code を実行します (model: $MODEL)"
echo "$LOG_PREFIX プロンプト: $PROMPT_FILE"
echo "$LOG_PREFIX 出力先: $OUTPUT_FILE"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "$LOG_PREFIX [DRY RUN] 実際には実行しません。"
  exit 0
fi

cat "$PROMPT_FILE" | claude \
  --print \
  --model "$MODEL" \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Write,Glob,Grep,Bash(git add *),Bash(git commit *),Bash(git status),Bash(git diff *),Bash(git log *),Bash(ls *),Bash(find *),Bash(date *),Bash(echo *)"

# ── 完了確認 ─────────────────────────────────────────────────
if [[ -f "$OUTPUT_FILE" ]]; then
  LINE_COUNT="$(wc -l < "$OUTPUT_FILE")"
  echo "$LOG_PREFIX 完了: $OUTPUT_FILE ($LINE_COUNT 行)"
else
  echo "$LOG_PREFIX WARNING: 出力ファイルが見つかりません: $OUTPUT_FILE" >&2
  exit 1
fi

echo "$LOG_PREFIX 終了"
