---
description: open Issue を分類し、ラベル・優先度・担当領域を提案する。issue-triage スキルを使って GitHub の未ラベル Issue を整理する。
---

# /issue-triage — Issue トリアージ

`issue-triage` スキルを参照し、以下の手順で実行せよ。

## 手順

1. `gh issue list --state open --json number,title,labels,body --limit 30` で open Issue を取得する
2. 未ラベルの Issue を特定する
3. 各 Issue の本文・タイトルを分析し、種別（bug/feature/chore/docs）・優先度（high/medium/low）・領域（frontend/lambda/infra/data）を判定する
4. 結果をテーブル形式でユーザーに提示し、承認を得る
5. 承認されたラベルを `gh issue edit` で付与する
6. 分類根拠を Issue コメントとして投稿する（任意）

## 実行例

```
/issue-triage          # 全 open Issue を対象
/issue-triage #42 #43  # 特定 Issue のみ
```

## 注意

- ユーザーの承認なしにラベルを付与しない
- Issue の仕様内容には介入しない（分類のみ）
- MCP が利用できない場合は `gh CLI` でフォールバックする
