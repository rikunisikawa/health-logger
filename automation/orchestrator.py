#!/usr/bin/env python3
"""
automation/orchestrator.py
開発サイクルオーケストレーター

タスク YAML を inbox → ready → doing → review → done と状態遷移させながら
role ごとに claude --print を呼び出してタスクを実行する。

使い方:
  python3 automation/orchestrator.py --dry-run        # 動作確認のみ
  python3 automation/orchestrator.py                  # 実際に実行
  python3 automation/orchestrator.py --max-cycles 3   # 最大3サイクル
"""

import argparse
import json
import logging
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import yaml

# ── 定数 ────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).parent.parent
TASKS_DIR = REPO_ROOT / "tasks"
PROMPTS_DIR = Path(__file__).parent / "prompts"
LOGS_DIR = REPO_ROOT / "logs"

STATUS_DIRS = ["inbox", "ready", "doing", "review", "done", "failed"]
MAX_RETRY = 2
DEFAULT_MODEL = "haiku"

# ロールとプロンプトファイルのマッピング
ROLE_PROMPTS = {
    "product_manager": "product_manager.md",
    "project_manager": "project_manager.md",
    "designer":        "designer.md",
    "engineer":        "engineer.md",
    "reviewer":        "reviewer.md",
    "explainer":       "explainer.md",
}

# ── ロギング設定 ─────────────────────────────────────────────
def setup_logging(cycle_id: str) -> logging.Logger:
    LOGS_DIR.mkdir(exist_ok=True)
    log_file = LOGS_DIR / f"dev-cycle-{cycle_id}.log"

    logger = logging.getLogger("orchestrator")
    logger.setLevel(logging.DEBUG)

    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%H:%M:%S")

    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setFormatter(fmt)

    ch = logging.StreamHandler()
    ch.setFormatter(fmt)

    logger.addHandler(fh)
    logger.addHandler(ch)
    return logger


# ── タスク操作 ───────────────────────────────────────────────
def load_tasks(status: str) -> list[dict]:
    """指定ステータスのタスクを全件読み込む"""
    status_dir = TASKS_DIR / status
    tasks = []
    for path in sorted(status_dir.glob("*.yaml")):
        with open(path, encoding="utf-8") as f:
            task = yaml.safe_load(f)
            task["_path"] = path
            tasks.append(task)
    return tasks


def save_task(task: dict, new_status: str) -> Path:
    """タスクを新しいステータスディレクトリに移動して保存"""
    old_path: Path = task.pop("_path")
    task["status"] = new_status
    task["updated_at"] = datetime.now().strftime("%Y-%m-%d")

    new_dir = TASKS_DIR / new_status
    new_dir.mkdir(exist_ok=True)
    new_path = new_dir / old_path.name

    with open(new_path, "w", encoding="utf-8") as f:
        yaml.dump(task, f, allow_unicode=True, default_flow_style=False)

    if old_path != new_path and old_path.exists():
        old_path.unlink()

    task["_path"] = new_path
    return new_path


def get_done_ids() -> set[str]:
    """完了タスクの task_id 一覧を返す"""
    done_tasks = load_tasks("done")
    return {t["task_id"] for t in done_tasks}


def select_next_task(logger: logging.Logger) -> dict | None:
    """ready キューから次に実行するタスクを選ぶ（依存解決・優先度順）"""
    ready_tasks = load_tasks("ready")
    if not ready_tasks:
        logger.info("ready タスクなし")
        return None

    done_ids = get_done_ids()
    priority_order = {"high": 0, "medium": 1, "low": 2}

    candidates = []
    for task in ready_tasks:
        deps = task.get("dependencies", []) or []
        unmet = [d for d in deps if d not in done_ids]
        if unmet:
            logger.debug(f"  依存未完了: {task['task_id']} → 待ち: {unmet}")
            continue
        candidates.append(task)

    if not candidates:
        logger.info("依存関係が解決済みの ready タスクなし")
        return None

    candidates.sort(key=lambda t: priority_order.get(t.get("priority", "medium"), 1))
    return candidates[0]


# ── Claude 呼び出し ──────────────────────────────────────────
def build_prompt(task: dict, role: str) -> str:
    """ロールプロンプト + タスク内容を結合したプロンプトを生成"""
    prompt_file = PROMPTS_DIR / ROLE_PROMPTS.get(role, "engineer.md")

    role_instruction = ""
    if prompt_file.exists():
        role_instruction = prompt_file.read_text(encoding="utf-8")

    task_yaml = yaml.dump(
        {k: v for k, v in task.items() if not k.startswith("_")},
        allow_unicode=True, default_flow_style=False
    )

    return f"""{role_instruction}

---

## 今回のタスク

```yaml
{task_yaml}
```

上記タスクを実行してください。
- `outputs` に記載されたファイルを必ず出力してください
- `definition_of_done` の全項目を満たしてください
- `constraints` を遵守してください
- 完了したら「✅ 完了: <task_id>」で締めてください
"""


def run_claude(prompt: str, model: str, allowed_tools: str, dry_run: bool,
               logger: logging.Logger) -> tuple[bool, str]:
    """claude --print を実行し、(成功, 出力) を返す"""
    if dry_run:
        logger.info("  [DRY RUN] claude --print の呼び出しをスキップ")
        return True, "[DRY RUN] スキップ"

    # bash の PATH が subprocess に引き継がれない場合があるためフルパスを取得
    import shutil
    claude_bin = shutil.which("claude")
    if not claude_bin:
        # nvm 経由インストールの場合の既知パスにフォールバック
        fallback = Path.home() / ".nvm/versions/node/v22.16.0/bin/claude"
        claude_bin = str(fallback) if fallback.exists() else "claude"
    logger.debug(f"  claude path: {claude_bin}")

    cmd = [
        claude_bin, "--print",
        "--model", model,
        "--permission-mode", "bypassPermissions",
        "--allowedTools", allowed_tools,
    ]

    try:
        result = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=300,
            cwd=str(REPO_ROOT),
        )
        output = result.stdout + (("\n" + result.stderr) if result.stderr else "")
        # returncode == 0 であれば成功とする（Claude が ✅ を出さない場合も許容）
        success = result.returncode == 0
        return success, output
    except subprocess.TimeoutExpired:
        return False, "タイムアウト（300秒）"
    except Exception as e:
        return False, str(e)


# ── メインループ ─────────────────────────────────────────────
def run_cycle(
    dry_run: bool = False,
    max_cycles: int = 10,
    model: str = DEFAULT_MODEL,
    auto_approve: bool = False,
) -> dict:
    cycle_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    logger = setup_logging(cycle_id)

    logger.info(f"=== 開発サイクル開始: {cycle_id} ===")
    logger.info(f"dry_run={dry_run}, max_cycles={max_cycles}, model={model}, auto_approve={auto_approve}")

    # inbox → ready への昇格
    inbox_tasks = load_tasks("inbox")
    for task in inbox_tasks:
        logger.info(f"inbox → ready: {task['task_id']}")
        save_task(task, "ready")

    results = {"cycle_id": cycle_id, "executed": [], "skipped": [], "failed": []}
    cycle_count = 0

    while cycle_count < max_cycles:
        cycle_count += 1
        task = select_next_task(logger)

        if task is None:
            logger.info("実行可能なタスクなし → サイクル終了")
            break

        task_id = task["task_id"]
        role = task.get("role", "engineer")
        logger.info(f"[{cycle_count}/{max_cycles}] 実行: {task_id} (role={role})")

        # doing に移動
        save_task(task, "doing")

        # ツール制限（role によって調整）
        allowed_tools = (
            "Read,Write,Glob,Grep,"
            "Bash(git add *),Bash(git commit *),Bash(git status),"
            "Bash(git diff *),Bash(pytest *),Bash(ls *),Bash(date *)"
        )

        prompt = build_prompt(task, role)
        success, output = run_claude(prompt, model, allowed_tools, dry_run, logger)

        if success:
            logger.info(f"  ✅ 完了: {task_id}")
            save_task(task, "review")
            results["executed"].append(task_id)

            # reviewer タスクは自動で done に
            if auto_approve or role == "reviewer" or dry_run:
                save_task(task, "done")
        else:
            retry = task.get("retry_count", 0)
            if retry < MAX_RETRY:
                task["retry_count"] = retry + 1
                logger.warning(f"  ⚠️ 失敗（リトライ {retry + 1}/{MAX_RETRY}）: {task_id}")
                save_task(task, "ready")
                results["skipped"].append(task_id)
            else:
                logger.error(f"  ❌ 最大リトライ超過 → failed: {task_id}")
                save_task(task, "failed")
                results["failed"].append(task_id)

        # ログに出力を記録
        log_output_file = LOGS_DIR / f"{cycle_id}-{task_id}.txt"
        log_output_file.write_text(output, encoding="utf-8")

    # サイクル完了後: review → done に残っているものは人間承認待ち
    review_tasks = load_tasks("review")
    if review_tasks:
        waiting = [t["task_id"] for t in review_tasks]
        logger.info(f"人間承認待ち (review): {waiting}")
        results["waiting_approval"] = waiting

    logger.info(f"=== サイクル完了: {cycle_id} ===")
    logger.info(f"  実行済み: {results['executed']}")
    logger.info(f"  失敗: {results['failed']}")

    # サマリー JSON を保存
    summary_path = LOGS_DIR / f"summary-{cycle_id}.json"
    summary_path.write_text(
        json.dumps(results, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    return results


# ── エントリポイント ─────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="開発サイクルオーケストレーター")
    parser.add_argument("--dry-run", action="store_true", help="Claude を実際に呼ばずに動作確認")
    parser.add_argument("--max-cycles", type=int, default=10, help="最大サイクル数（デフォルト: 10）")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Claude モデル (haiku/sonnet/opus)")
    parser.add_argument("--auto-approve", action="store_true", help="review → done を自動遷移（デモ用）")
    args = parser.parse_args()

    try:
        import yaml
    except ImportError:
        print("ERROR: pyyaml が必要です: pip install pyyaml", file=sys.stderr)
        sys.exit(1)

    results = run_cycle(
        dry_run=args.dry_run,
        max_cycles=args.max_cycles,
        model=args.model,
        auto_approve=args.auto_approve,
    )
    sys.exit(0 if not results.get("failed") else 1)
