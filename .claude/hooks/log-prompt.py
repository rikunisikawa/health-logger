#!/usr/bin/env python3
"""
Stop hook: プロンプトごとのログを .claude/logs/YYYY-MM-DD/HHMMSS.md に保存する。

Claude が1回の応答を完了するたびに発火し、直前のユーザープロンプトと
アシスタントのテキスト出力をMarkdownファイルに記録する。
"""
import sys
import json
import os
import glob
from datetime import datetime


def read_entries(session_id: str, transcript_path: str) -> list:
    if transcript_path and os.path.exists(transcript_path):
        with open(transcript_path, "r", encoding="utf-8") as f:
            return [json.loads(l) for l in f if l.strip()]
    if session_id:
        matches = glob.glob(
            os.path.expanduser(f"~/.claude/projects/*/{session_id}.jsonl")
        )
        if matches:
            with open(matches[0], "r", encoding="utf-8") as f:
                return [json.loads(l) for l in f if l.strip()]
    return []


def is_real_prompt(entry: dict) -> str | None:
    """エントリが実際のユーザー入力テキストなら返す。ツール結果・skill注入はNone。"""
    if entry.get("type") != "user" or entry.get("userType") != "external":
        return None
    content = entry.get("message", {}).get("content", "")
    # 文字列の場合は実テキスト
    if isinstance(content, str):
        return content.strip() or None
    # リストの場合はtool_resultのみはスキップ
    if isinstance(content, list):
        has_tool_result = any(
            isinstance(c, dict) and c.get("type") == "tool_result"
            for c in content
        )
        if has_tool_result:
            return None
        # textブロックがある場合（skillインジェクション等）もスキップ
        # → 文字列のみを「本物のプロンプト」とする
        return None
    return None


def extract_assistant_text(content) -> str:
    if isinstance(content, list):
        return "\n".join(
            c.get("text", "") for c in content
            if isinstance(c, dict) and c.get("type") == "text"
        )
    return ""


def main():
    try:
        payload = json.loads(sys.stdin.read())
    except Exception:
        payload = {}

    session_id = payload.get("session_id", "")
    transcript_path = payload.get("transcript_path", "")

    entries = read_entries(session_id, transcript_path)
    if not entries:
        return

    # 最後の「本物の」ユーザープロンプトを探す
    last_user_idx = None
    prompt_text = None
    for i, e in enumerate(entries):
        text = is_real_prompt(e)
        if text:
            last_user_idx = i
            prompt_text = text

    if last_user_idx is None or not prompt_text:
        return

    user_entry = entries[last_user_idx]

    # プロンプト以降のアシスタントテキストを収集（次の本物プロンプトまで）
    assistant_texts = []
    for e in entries[last_user_idx + 1:]:
        if is_real_prompt(e):
            break
        if e.get("type") == "assistant":
            text = extract_assistant_text(
                e.get("message", {}).get("content", [])
            ).strip()
            if text:
                assistant_texts.append(text)

    # タイムスタンプをローカル時刻に変換
    ts = user_entry.get("timestamp", "")
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone()
    except Exception:
        dt = datetime.now()

    date_str = dt.strftime("%Y-%m-%d")
    time_str = dt.strftime("%H%M%S")

    # ログディレクトリ作成
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(script_dir))
    log_dir = os.path.join(project_root, ".claude", "logs", date_str)
    os.makedirs(log_dir, exist_ok=True)

    log_file = os.path.join(log_dir, f"{time_str}.md")
    n = 1
    while os.path.exists(log_file):
        log_file = os.path.join(log_dir, f"{time_str}_{n}.md")
        n += 1

    output = "\n\n".join(assistant_texts) if assistant_texts else "(no text output)"
    md = f"""# Claude Code Work Log

**Date:** {dt.strftime("%Y-%m-%d %H:%M:%S")}
**Session:** {session_id}
**Branch:** {user_entry.get("gitBranch", "unknown")}

---

## Prompt

{prompt_text}

---

## Output

{output}
"""
    with open(log_file, "w", encoding="utf-8") as f:
        f.write(md)


if __name__ == "__main__":
    main()
