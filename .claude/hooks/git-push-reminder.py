#!/usr/bin/env python3
"""
PreToolUse hook: git push の前に変更差分の確認を促す。
git push が含まれるコマンドを検出したら警告を出力する。
終了コード 0（ブロックしない）でフィードバックのみ行う。
"""
import sys
import json
import re

data = json.load(sys.stdin)
tool_input = data.get("tool_input", {})
command = tool_input.get("command", "")

# git push を含むコマンドのみ対象（--force は deny リストで既に禁止）
if not re.search(r"\bgit\s+push\b", command):
    sys.exit(0)

# force push は別途 deny で禁止済みなので警告のみ
print(json.dumps({
    "type": "remind",
    "message": (
        "[git-push-reminder] push 前に以下を確認してください:\n"
        "  1. git diff origin/main...HEAD — push 対象のコミット差分\n"
        "  2. シークレット・PAT・VAPID 鍵がコードに含まれていないか\n"
        "  3. CI が通る見込みがあるか（pytest lambda/ -v / npx tsc --noEmit）\n"
        "  問題がなければ push を続行してください。"
    )
}))
sys.exit(0)
