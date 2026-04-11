#!/usr/bin/env python3
"""
UserPromptSubmit hook: セッション開始時にプロジェクト文脈をロードする。
- セッション内で初回のみ実行（/tmp のロックファイルで制御）
- docs/ai-pm/sprint-current.md の読み込み（ローカル・高速）
- gh issue list で直近 open Issue を取得（ネットワーク・5秒タイムアウト）
ネットワーク不可時はスキップし、メイン処理を止めない。
"""
import sys
import json
import os
import subprocess


LOCK_FILE = f"/tmp/health-logger-ctx-{os.getpid()}.lock"
SESSION_MARKER = "/tmp/health-logger-session-started.lock"


def already_ran() -> bool:
    """セッション内で既に実行済みか判定（親プロセスIDで判断）"""
    return os.path.exists(SESSION_MARKER)


def mark_ran() -> None:
    try:
        with open(SESSION_MARKER, "w") as f:
            f.write(str(os.getpid()))
    except Exception:
        pass


def get_project_root() -> str:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(os.path.dirname(script_dir))


def read_sprint_current(project_root: str) -> str:
    sprint_file = os.path.join(project_root, "docs", "ai-pm", "sprint-current.md")
    try:
        with open(sprint_file, "r", encoding="utf-8") as f:
            content = f.read()
        # 最初の10行だけ返す（軽量化）
        lines = content.strip().split("\n")[:10]
        return "\n".join(lines)
    except FileNotFoundError:
        return ""
    except Exception:
        return ""


def get_open_issues(project_root: str) -> str:
    try:
        result = subprocess.run(
            ["gh", "issue", "list", "--state", "open",
             "--json", "number,title,labels",
             "--limit", "5"],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return ""
        issues = json.loads(result.stdout)
        if not issues:
            return "open Issue なし"
        lines = []
        for issue in issues:
            labels = ", ".join(l["name"] for l in issue.get("labels", []))
            label_str = f" [{labels}]" if labels else ""
            lines.append(f"  #{issue['number']}: {issue['title']}{label_str}")
        return "\n".join(lines)
    except subprocess.TimeoutExpired:
        return ""
    except Exception:
        return ""


def main():
    try:
        # セッション内で初回のみ実行
        if already_ran():
            return

        mark_ran()

        project_root = get_project_root()
        output_parts = []

        # スプリント状態を読み込む
        sprint = read_sprint_current(project_root)
        if sprint:
            output_parts.append(f"📋 スプリント状態:\n{sprint}")

        # open Issue を取得
        issues = get_open_issues(project_root)
        if issues:
            output_parts.append(f"🎯 直近の open Issue:\n{issues}")

        if output_parts:
            print("\n--- プロジェクト文脈ロード ---")
            print("\n".join(output_parts))
            print("-----------------------------\n")

    except Exception:
        pass  # hook のエラーでメイン処理を止めない


if __name__ == "__main__":
    main()
