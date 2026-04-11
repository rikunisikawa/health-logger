---
description: 次スプリントの計画を立案する。open Issue から着手候補を選定し、マイルストーン割り当て案をユーザーに提示する。
---

# /sprint-plan — スプリント計画

`sprint-planning` スキルを参照し、以下の手順で実行せよ。

## 手順

1. `gh issue list --state open` で backlog を取得する
2. `gh milestone list` で現在のマイルストーン状況を確認する
3. 優先度・工数・領域バランスを考慮してスプリント候補を選定する
4. スプリントボード案をテーブル形式でユーザーに提示する
5. ユーザーが承認したら `integration-agent` にマイルストーン割り当てを委譲する

## 実行例

```
/sprint-plan                    # デフォルト 2週間スプリント
/sprint-plan --duration 1week   # 1週間スプリント
```

## 注意

- スプリント計画の確定はユーザーの承認が必要
- マイルストーンの作成・Issue の割り当ては承認後のみ実行する
- 前回ベロシティが不明な場合は 5 Issue/Sprint を仮定する
