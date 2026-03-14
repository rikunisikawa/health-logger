#!/usr/bin/env python3
"""
PostToolUse hook: lambda/ 配下の実装ファイル（.py）編集後に pytest を自動実行。
テストファイル（test_*.py）自体の編集時は実行しない（Red 状態を保持するため）。
"""
import sys
import json
import subprocess
import os


def get_file_path(data: dict) -> str:
    tool_input = data.get("tool_input", data)
    return (
        tool_input.get("file_path")
        or tool_input.get("path")
        or ""
    )


def should_run_tests(path: str) -> bool:
    """lambda/ 配下の実装 .py ファイルか判定（テストファイルは除外）"""
    norm = path.lstrip("./")
    if "lambda/" not in norm:
        return False
    if not norm.endswith(".py"):
        return False
    # test_*.py は除外（TDD の Red フェーズを壊さないため）
    filename = os.path.basename(norm)
    if filename.startswith("test_"):
        return False
    return True


def main():
    try:
        data = json.load(sys.stdin)
        path = get_file_path(data)

        if not should_run_tests(path):
            return

        # このスクリプトは .claude/hooks/ にあるのでプロジェクトルートを導出
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(os.path.dirname(script_dir))

        print(f"\n🧪 Lambda 実装ファイル変更を検出 → pytest を実行します")
        print(f"   変更ファイル: {path}\n")

        result = subprocess.run(
            ["pytest", "lambda/", "-v", "--tb=short"],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=60,
        )

        output = result.stdout
        if result.stderr:
            output += "\n" + result.stderr

        # 長すぎる場合は末尾を表示
        if len(output) > 4000:
            output = "...(省略)...\n" + output[-4000:]

        print(output)

        if result.returncode == 0:
            print("✅ pytest PASSED")
        else:
            print("❌ pytest FAILED — 修正が必要です")

    except subprocess.TimeoutExpired:
        print("⚠️  pytest がタイムアウト（60秒）しました")
    except Exception:
        pass


if __name__ == "__main__":
    main()
