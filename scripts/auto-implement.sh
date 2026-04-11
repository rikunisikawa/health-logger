#!/usr/bin/env bash
# ============================================================
# scripts/auto-implement.sh
# GitHub Issue ベースの自動実装スクリプト
#
# 動作:
#   1. 現在の最小マイルストーンの open Issue から次の実装対象を選ぶ
#   2. Issue に "auto-implement: in-progress" ラベルを付与
#   3. claude --print で実装を依頼（PR 作成まで自動）
#   4. 成功 → ラベルを "auto-implement: done" に変更
#      失敗 → ラベルを "auto-implement: blocked" に変更
#
# 使い方:
#   bash scripts/auto-implement.sh                    # 通常実行
#   bash scripts/auto-implement.sh --dry-run          # Claude を呼ばず確認のみ
#   bash scripts/auto-implement.sh --model sonnet     # モデル指定（デフォルト: sonnet）
#   bash scripts/auto-implement.sh --issue 42         # Issue番号を直接指定
#
# cron 設定例 (毎日 AM 3:00):
#   0 3 * * * cd ~/dev/health-logger/health-logger && bash scripts/auto-implement.sh >> /tmp/auto-implement.log 2>&1
#
# 前提条件:
#   - gh CLI がインストールされ、認証済みであること
#   - claude コマンドがインストールされていること
#   - GitHub リポジトリに Milestone が設定されていること
#   - 実装対象 Issue に "implementation-ready" ラベルが付いているか、
#     または "auto-implement: blocked" ラベルが付いていないこと
# ============================================================

set -euo pipefail

# ── 設定 ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_PREFIX="[auto-implement $(date '+%Y-%m-%d %H:%M:%S')]"
LOG_FILE="/tmp/auto-implement.log"

# ラベル定義
LABEL_IN_PROGRESS="auto-implement: in-progress"
LABEL_DONE="auto-implement: done"
LABEL_BLOCKED="auto-implement: blocked"
LABEL_READY="implementation-ready"

# デフォルト設定
MODEL="${MODEL:-sonnet}"
DRY_RUN=false
FORCE_ISSUE=""

# ── 引数パース ───────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)     DRY_RUN=true; shift ;;
    --model)       MODEL="$2"; shift 2 ;;
    --model=*)     MODEL="${1#*=}"; shift ;;
    --issue)       FORCE_ISSUE="$2"; shift 2 ;;
    --issue=*)     FORCE_ISSUE="${1#*=}"; shift ;;
    -h|--help)
      sed -n '3,26p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── ヘルパー関数 ─────────────────────────────────────────────
log() {
  echo "$LOG_PREFIX $*"
}

log_error() {
  echo "$LOG_PREFIX ERROR: $*" >&2
}

# ── 前提チェック ─────────────────────────────────────────────
log "開始"

if ! command -v claude &>/dev/null; then
  log_error "claude コマンドが見つかりません。Claude Code をインストールしてください。"
  exit 1
fi

if ! command -v gh &>/dev/null; then
  log_error "gh コマンドが見つかりません。GitHub CLI をインストールしてください。"
  exit 1
fi

cd "$REPO_ROOT"

# リポジトリのオーナー/名前を取得
REPO_FULL=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null || echo "")
if [[ -z "$REPO_FULL" ]]; then
  log_error "リポジトリ情報を取得できません。gh auth status を確認してください。"
  exit 1
fi

# ── ラベルの存在確認・作成 ───────────────────────────────────
ensure_label() {
  local label="$1"
  local color="${2:-0075ca}"
  # gh api でラベルが存在するか確認
  if ! gh api "repos/$REPO_FULL/labels" --jq '.[].name' 2>/dev/null | grep -qF "$label"; then
    log "ラベル作成: $label"
    if [[ "$DRY_RUN" == "false" ]]; then
      gh api "repos/$REPO_FULL/labels" \
        -X POST \
        -f name="$label" \
        -f color="$color" \
        --silent 2>/dev/null || true
    fi
  fi
}

log "ラベルを確認・作成しています..."
ensure_label "$LABEL_IN_PROGRESS" "fbca04"   # 黄
ensure_label "$LABEL_DONE"        "0e8a16"   # 緑
ensure_label "$LABEL_BLOCKED"     "d93f0b"   # 赤
ensure_label "$LABEL_READY"       "1d76db"   # 青

# ── 実装対象 Issue の選択 ────────────────────────────────────
# 注意: この関数内の log は >&2 でstderrに出力すること（stdout は戻り値専用）
SELECTED_MILESTONE=""

select_next_issue() {
  if [[ -n "$FORCE_ISSUE" ]]; then
    echo "$FORCE_ISSUE"
    return 0
  fi

  # 最小番号の open マイルストーンを取得（gh api 経由）
  local milestone_json milestone_title milestone_number
  milestone_json=$(gh api "repos/$REPO_FULL/milestones?state=open&per_page=100" \
    --jq 'sort_by(.number) | .[0] | {number: .number, title: .title}' 2>/dev/null || echo "")

  if [[ -z "$milestone_json" || "$milestone_json" == "null" ]]; then
    echo "$LOG_PREFIX open マイルストーンが見つかりません" >&2
    return 1
  fi

  milestone_title=$(echo "$milestone_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['title'])")
  milestone_number=$(echo "$milestone_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['number'])")

  echo "$LOG_PREFIX 対象マイルストーン: $milestone_title (番号: $milestone_number)" >&2
  SELECTED_MILESTONE="$milestone_title"

  # そのマイルストーンの open Issue を取得（blocked / in-progress を除外）
  # gh issue list の --milestone + --json は旧バージョンで非対応のため gh api を使用
  local issue_number
  issue_number=$(gh api "repos/$REPO_FULL/issues?state=open&milestone=${milestone_number}&per_page=100" \
    --jq "[
      .[] |
      select(
        (.labels | map(.name) | contains([\"$LABEL_BLOCKED\"]) | not) and
        (.labels | map(.name) | contains([\"$LABEL_IN_PROGRESS\"]) | not)
      )
    ] | sort_by(.number) | .[0].number" 2>/dev/null || echo "")

  if [[ -z "$issue_number" || "$issue_number" == "null" ]]; then
    echo "$LOG_PREFIX 実装対象の Issue が見つかりません（マイルストーン: $milestone_title）" >&2
    return 1
  fi

  echo "$issue_number"
}

ISSUE_NUMBER=$(select_next_issue || true)

if [[ -z "$ISSUE_NUMBER" ]]; then
  log "実装する Issue がありません。終了します。"
  exit 0
fi

# Issue の詳細を取得
ISSUE_TITLE=$(gh issue view "$ISSUE_NUMBER" --json title --jq '.title' 2>/dev/null || echo "Issue #$ISSUE_NUMBER")
ISSUE_URL=$(gh issue view "$ISSUE_NUMBER" --json url --jq '.url' 2>/dev/null || echo "")

log "実装対象: #$ISSUE_NUMBER - $ISSUE_TITLE"
log "URL: $ISSUE_URL"

# ── dry-run の場合はここで終了 ────────────────────────────────
if [[ "$DRY_RUN" == "true" ]]; then
  log "[DRY RUN] 実際には実行しません。"
  log "[DRY RUN] 実装対象 Issue: #$ISSUE_NUMBER"
  exit 0
fi

# ── in-progress ラベルを付与 ─────────────────────────────────
log "ラベル付与: $LABEL_IN_PROGRESS"
gh issue edit "$ISSUE_NUMBER" --add-label "$LABEL_IN_PROGRESS" 2>/dev/null || true

# ── Claude で実装 ────────────────────────────────────────────
# 開発手順は .claude/skills/implement/SKILL.md で定義済み。
# $ARGUMENTS を Issue 番号に置換したものをプロンプトとして渡す。
SKILL_FILE="$REPO_ROOT/.claude/skills/implement/SKILL.md"

if [[ ! -f "$SKILL_FILE" ]]; then
  log_error "スキルファイルが見つかりません: $SKILL_FILE"
  exit 1
fi

log "Claude を実行しています (model: $MODEL)..."

CLAUDE_EXIT=0
# SKILL.md の $ARGUMENTS を Issue 番号に置換して stdin 経由で渡す（引数渡しだと -- 始まりで誤認される）
sed "s/\$ARGUMENTS/${ISSUE_NUMBER}/g" "$SKILL_FILE" | claude \
  --print \
  --model "$MODEL" \
  --permission-mode bypassPermissions \
  --allowedTools "Read,Write,Edit,Glob,Grep,Bash(git *),Bash(gh *),Bash(npm *),Bash(pytest *),Bash(python *),Bash(python3 *),Bash(npx *),Bash(ls *),Bash(find *),Bash(echo *),Bash(pwd),Bash(cd * && *)" \
  || CLAUDE_EXIT=$?

# ── 結果に応じてラベルを更新 ─────────────────────────────────
gh issue edit "$ISSUE_NUMBER" --remove-label "$LABEL_IN_PROGRESS" 2>/dev/null || true

if [[ $CLAUDE_EXIT -eq 0 ]]; then
  log "実装成功: Issue #$ISSUE_NUMBER"
  gh issue edit "$ISSUE_NUMBER" --add-label "$LABEL_DONE" 2>/dev/null || true
  log "ラベル付与: $LABEL_DONE"
else
  log_error "実装失敗: Issue #$ISSUE_NUMBER (exit code: $CLAUDE_EXIT)"
  gh issue edit "$ISSUE_NUMBER" --add-label "$LABEL_BLOCKED" 2>/dev/null || true
  log "ラベル付与: $LABEL_BLOCKED"

  # Issue にコメントを残す
  gh issue comment "$ISSUE_NUMBER" \
    --body "⚠️ **自動実装が失敗しました** ($(date '+%Y-%m-%d %H:%M'))\n\nClaude の実行が exit code ${CLAUDE_EXIT} で終了しました。ログは \`/tmp/auto-implement.log\` を確認してください。\n\n手動での実装が必要です。" \
    2>/dev/null || true

  exit 1
fi

log "終了"
