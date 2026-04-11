#!/usr/bin/env python3
"""
PreToolUse hook: 重要ファイル（CLAUDE.md/settings.json/hooks等）の変更時に警告を出す。
終了コード 2 でブロック（ユーザーが許可すれば続行できる）。
メッセージを stdout に出力（Claude へのフィードバック）。
"""
import sys
import json
import os


CRITICAL_FILES = [
    ("CLAUDE.md",              "AI 全体の動作原則を変更します。意図した変更か確認してください。"),
    (".claude/settings.json",  "権限・フック設定を変更します。deny リストが緩まないか確認してください。"),
    (".mcp.json",              "MCP サーバー設定を変更します。接続先が変わります。"),
    (".claude/hooks/",         "フックスクリプトを変更します。既存の安全機構に影響する可能性があります。"),
]


def get_file_path(data: dict) -> str:
    tool_input = data.get("tool_input", data)
    return (
        tool_input.get("file_path")
        or tool_input.get("path")
        or ""
    )


def is_critical(path: str) -> tuple[bool, str]:
    norm = path.lstrip("./")
    # 絶対パスの場合、プロジェクトルートより後ろの部分を取得
    if "/" in norm:
        # health-logger/health-logger/ 以降を正規化
        for marker in ["health-logger/health-logger/", "health-logger/"]:
            idx = path.find(marker)
            if idx != -1:
                norm = path[idx + len(marker):]
                break

    for pattern, reason in CRITICAL_FILES:
        if pattern.endswith("/"):
            # ディレクトリマッチ
            if norm.startswith(pattern) or f"/{pattern.rstrip('/')}" in path:
                return True, reason
        else:
            # ファイル名マッチ
            if norm == pattern or norm.endswith("/" + pattern):
                return True, reason
    return False, ""


def main():
    try:
        data = json.load(sys.stdin)
        path = get_file_path(data)
        if not path:
            return

        flagged, reason = is_critical(path)
        if flagged:
            filename = os.path.basename(path)
            print(f"⚠️  重要ファイルの変更を検出: {filename}")
            print(f"   理由: {reason}")
            print(f"   パス: {path}")
            print(f"   意図した変更であれば続行してください。")
            sys.exit(2)

    except SystemExit:
        raise
    except Exception:
        pass


if __name__ == "__main__":
    main()
