#!/usr/bin/env python3
"""
automation/explainer.py
完了タスクからスライド原稿 JSON を生成する。
orchestrator.py から呼ばれるか、単独で実行できる。

使い方:
  python3 automation/explainer.py
  python3 automation/explainer.py --cycle-id 20260321-120000
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).parent.parent
TASKS_DIR = REPO_ROOT / "tasks"
EXPLAIN_DIR = REPO_ROOT / "docs" / "explain"


def load_done_tasks() -> list[dict]:
    done_dir = TASKS_DIR / "done"
    tasks = []
    for path in sorted(done_dir.glob("*.yaml")):
        with open(path, encoding="utf-8") as f:
            task = yaml.safe_load(f)
            tasks.append(task)
    return tasks


def build_slides(tasks: list[dict], cycle_id: str) -> dict:
    """完了タスクからスライド原稿 JSON を構築する"""
    titles = [t.get("title", "") for t in tasks]
    goals = [t.get("goal", "") for t in tasks]

    slides = [
        {
            "slide_number": 1,
            "title": "開発サイクルレポート",
            "bullets": [
                f"サイクルID: {cycle_id}",
                f"完了タスク数: {len(tasks)}件",
                f"生成日時: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            ],
            "narration": f"今回の開発サイクルで完了した{len(tasks)}件のタスクについて報告します。",
        },
        {
            "slide_number": 2,
            "title": "背景・課題",
            "bullets": [t.get("goal", "") for t in tasks[:3]],
            "narration": "今回取り組んだ課題と目標です。",
        },
        {
            "slide_number": 3,
            "title": "実装内容",
            "bullets": [f"【{t.get('role','')}】{t.get('title','')}" for t in tasks],
            "narration": "各ロールが担当した実装内容の一覧です。",
        },
        {
            "slide_number": 4,
            "title": "成果物",
            "bullets": [
                out.get("path", "")
                for t in tasks
                for out in (t.get("outputs") or [])
                if isinstance(out, dict)
            ] or ["（成果物なし）"],
            "narration": "今回のサイクルで生成されたファイルの一覧です。",
        },
        {
            "slide_number": 5,
            "title": "今後の課題・拡張案",
            "bullets": [
                "Phase 2: pptx デザイン改善・レビュー承認フローの強化",
                "Phase 3: GitHub Actions への移植",
                "動画ナレーション原稿の自動生成",
            ],
            "narration": "今後の改善ポイントと拡張計画です。",
        },
    ]

    return {
        "title": f"開発サイクルレポート: {cycle_id}",
        "cycle_id": cycle_id,
        "summary": f"{len(tasks)}件のタスクを完了しました: " + "、".join(titles[:3]),
        "slides": slides,
    }


def run(cycle_id: str | None = None) -> Path:
    cycle_id = cycle_id or datetime.now().strftime("%Y%m%d-%H%M%S")
    EXPLAIN_DIR.mkdir(parents=True, exist_ok=True)

    tasks = load_done_tasks()
    if not tasks:
        print("WARNING: 完了タスクが見つかりません。サンプルデータで生成します。")
        tasks = [{"task_id": "sample", "title": "サンプルタスク",
                  "goal": "動作確認", "role": "engineer", "outputs": []}]

    deck = build_slides(tasks, cycle_id)

    output_path = EXPLAIN_DIR / f"{cycle_id}.json"
    output_path.write_text(json.dumps(deck, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ スライド原稿を生成しました: {output_path}")
    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="スライド原稿 JSON 生成")
    parser.add_argument("--cycle-id", help="サイクルID（省略時は現在日時）")
    args = parser.parse_args()

    try:
        import yaml
    except ImportError:
        print("ERROR: pyyaml が必要です: pip install pyyaml", file=sys.stderr)
        sys.exit(1)

    run(args.cycle_id)
