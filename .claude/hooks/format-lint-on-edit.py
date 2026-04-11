#!/usr/bin/env python3
"""
PostToolUse hook: ファイル編集後に自動フォーマット・lint を実行する。
- Python (.py): ruff check --fix → ruff format
- TypeScript (.ts/.tsx): npx eslint --fix → npx prettier --write（frontend/ 配下のみ）
エラーでも exit 0（lint 失敗でメイン処理を止めない）。
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


def get_project_root() -> str:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(os.path.dirname(script_dir))


def run(cmd: list[str], cwd: str, timeout: int = 30) -> tuple[int, str]:
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        output = result.stdout
        if result.stderr:
            output += result.stderr
        return result.returncode, output
    except subprocess.TimeoutExpired:
        return 1, f"⚠️ タイムアウト ({timeout}秒): {' '.join(cmd)}"
    except FileNotFoundError:
        return 1, f"⚠️ コマンドが見つかりません: {cmd[0]}"
    except Exception as e:
        return 1, str(e)


def format_python(path: str, project_root: str) -> None:
    print(f"\n🔧 Python フォーマット中: {os.path.basename(path)}")

    code, out = run(["ruff", "check", "--fix", path], cwd=project_root)
    if out.strip():
        print(out.strip())

    code, out = run(["ruff", "format", path], cwd=project_root)
    if out.strip():
        print(out.strip())

    print("✅ ruff 完了")


def format_typescript(path: str, project_root: str) -> None:
    # frontend/ 配下のみ対象
    norm = path.replace("\\", "/")
    if "frontend/" not in norm:
        return

    frontend_root = os.path.join(project_root, "frontend")
    if not os.path.isdir(frontend_root):
        return

    print(f"\n🔧 TypeScript フォーマット中: {os.path.basename(path)}")

    code, out = run(["npx", "eslint", "--fix", path], cwd=frontend_root)
    if out.strip():
        print(out.strip())

    code, out = run(["npx", "prettier", "--write", path], cwd=frontend_root)
    if out.strip():
        print(out.strip())

    print("✅ eslint + prettier 完了")


def main():
    try:
        data = json.load(sys.stdin)
        path = get_file_path(data)
        if not path:
            return

        project_root = get_project_root()

        if path.endswith(".py"):
            # テストファイルも対象（run-tests-after-edit.py とは異なる）
            format_python(path, project_root)
        elif path.endswith((".ts", ".tsx")):
            format_typescript(path, project_root)

    except Exception:
        pass  # hook のエラーでメイン処理を止めない


if __name__ == "__main__":
    main()
