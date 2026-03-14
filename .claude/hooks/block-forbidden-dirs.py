#!/usr/bin/env python3
"""
PreToolUse hook: app/ と terraform/envs/dev/ への書き込みをブロック。
終了コード 2 でブロック、メッセージを stdout に出力（Claude へのフィードバック）。
"""
import sys
import json


FORBIDDEN = [
    ("app/",                "Rails 参照用ディレクトリ（デプロイ不要・編集禁止）"),
    ("terraform/envs/dev/", "dev 環境は放置中（参照用のみ・編集禁止）"),
]


def get_file_path(data: dict) -> str:
    tool_input = data.get("tool_input", data)
    return (
        tool_input.get("file_path")
        or tool_input.get("path")
        or ""
    )


def is_forbidden(path: str) -> tuple[bool, str]:
    # 先頭の ./ や / を除去して正規化
    norm = path.lstrip("./")
    for pattern, reason in FORBIDDEN:
        if norm.startswith(pattern) or f"/{pattern}" in path:
            return True, reason
    return False, ""


def main():
    try:
        data = json.load(sys.stdin)
        path = get_file_path(data)
        if not path:
            return

        blocked, reason = is_forbidden(path)
        if blocked:
            print(f"🚫 BLOCKED: {path}")
            print(f"   理由: {reason}")
            sys.exit(2)

    except SystemExit:
        raise
    except Exception:
        # Hook のエラーでメイン処理を止めない
        pass


if __name__ == "__main__":
    main()
