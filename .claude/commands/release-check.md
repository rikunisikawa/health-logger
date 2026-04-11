---
description: デプロイ前の最終チェックを実行し、Go/No-go 判定を出す。テスト・CI・open Issue・セキュリティを網羅的に確認する。
---

# /release-check — リリースチェック

`release-check` スキルを参照し、以下の手順で実行せよ。

## 手順

1. `pytest lambda/ -v` を実行してテスト全通過を確認する
2. `npx tsc --noEmit` を実行して型エラーがないことを確認する
3. `gh run list --limit 5` でCIの最新状態を確認する
4. マイルストーンの open Issue 残数を確認する（スプリント必須Issue）
5. セキュリティパターンのスキャンを実行する
6. Terraform 変更がある場合は `validate` を実行する
7. Go/No-go 判定レポートを表示する

## 実行例

```
/release-check                    # 現在のブランチを対象
/release-check --milestone Sprint-3  # マイルストーン指定
```

## 注意

- このコマンドはデプロイの実行を行わない（判定のみ）
- `terraform apply` は絶対に実行しない
- No-go の場合は対処手順を提示するが、実行は人間が判断する
