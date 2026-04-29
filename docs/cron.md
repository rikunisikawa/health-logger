# cron 設定ドキュメント

WSL 上で動作する定期実行ジョブの一覧と運用手順。

> 📊 **システム全体図**: [`docs/claude-code-system.drawio`](./claude-code-system.drawio)（Draw.io / VS Code 拡張で開く）

---

## 登録済みジョブ

| 実行時刻 | スクリプト | ログ | 目的 |
|---------|-----------|------|------|
| 3時間ごと | `scripts/auto-implement.sh` | `/tmp/auto-implement.log` | GitHub Issue を自動実装して PR を作成（0:00 / 3:00 / 6:00 / 9:00 / 12:00 / 15:00 / 18:00 / 21:00）|
| 毎月1日 AM 9:00 | `scripts/run-dev-env-review.sh --model haiku` | `/tmp/dev-env-review.log` | Claude Code 開発環境レビュー |

---

## 注意事項

- **cron は nvm の PATH を引き継がない**ため、`scripts/auto-implement.sh` の先頭で nvm の PATH を明示的に設定している
- Node.js のバージョンを変更した場合は `scripts/auto-implement.sh` の PATH 設定も更新すること
  ```bash
  # 現在の claude パスを確認
  which claude
  ```

## cron サービスの管理

WSL を再起動すると cron が止まる場合がある。以下で確認・起動する。

```bash
# 状態確認
service cron status

# 起動
sudo service cron start

# 停止
sudo service cron stop
```

---

## crontab の確認・編集

```bash
# 現在の設定を確認
crontab -l

# 編集
crontab -e
```

現在の crontab:

```cron
# 3時間ごとに自動実装を実行（レート制限時は次回に自動持ち越し）
0 */3 * * * cd ~/dev/health-logger/health-logger && bash scripts/auto-implement.sh >> /tmp/auto-implement.log 2>&1

# 毎月1日 AM 9:00 に開発環境レビューを実行
0 9 1 * * cd /home/riku_nishikawa/dev/health-logger/health-logger && bash scripts/run-dev-env-review.sh --model haiku >> /tmp/dev-env-review.log 2>&1
```

---

## ログの確認

```bash
# auto-implement のログ（リアルタイム）
tail -f /tmp/auto-implement.log

# auto-implement のログ（直近100行）
tail -100 /tmp/auto-implement.log

# dev-env-review のログ
tail -100 /tmp/dev-env-review.log

# エラーのみ確認
grep ERROR /tmp/auto-implement.log
```

---

## auto-implement.sh の動作

詳細は `docs/auto-implement.md` を参照。概要：

1. 最小番号の open マイルストーンから実装対象 Issue を選ぶ
2. `auto-implement: in-progress` ラベルを付与
3. `claude --print` で実装・PR 作成まで自動実行
4. 成功 → `auto-implement: done` / 失敗 → `auto-implement: blocked`

1回の実行で1 Issue を処理する。1日2回の実行で最大2 Issue が実装される。

### blocked になった Issue を再試行

```bash
# blocked ラベルを外す → 次回 cron で再選択される
gh issue edit <ISSUE_NUMBER> --repo rikunisikawa/health-logger --remove-label "auto-implement: blocked"
```

---

## 関連ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| `docs/auto-implement.md` | 自動実装システムの詳細・Issue の作り方 |
| `docs/dev-cycle.md` | 自動開発サイクル全体の説明 |
| `scripts/auto-implement.sh` | 自動実装スクリプト本体 |
| `scripts/run-dev-env-review.sh` | 開発環境レビュースクリプト本体 |
