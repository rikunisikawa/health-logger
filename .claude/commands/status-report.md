---
description: 週次の開発状況レポートを生成する。closed Issue・merged PR・CI 結果をまとめて docs/ai-pm/reports/ に保存する。
---

# /status-report — 週次ステータスレポート

`status-report` スキルを参照し、以下の手順で実行せよ。

## 手順

1. 直近 7 日間の closed Issue を `gh issue list --state closed` で取得する
2. 直近 7 日間の merged PR を `gh pr list --state merged` で取得する
3. CI/CD 実行結果を `gh run list --limit 10` で確認する
4. 進行中・ブロック中の Issue を特定する
5. レポートを生成し `docs/ai-pm/reports/YYYY-MM-DD-weekly.md` に保存する
6. コンソールにサマリーを表示する

## 実行例

```
/status-report           # 直近 7 日
/status-report --monthly # 直近 30 日
```

## 注意

- 外部サービス（Slack 等）への自動投稿は行わない
- コードの変更は含まない（レポート生成のみ）
- `docs/ai-pm/reports/` ディレクトリが存在しない場合は作成する
