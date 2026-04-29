# 自動実装システム（GitHub Issue ベース）

GitHub Issue を実装キューとして、cron から Claude を呼び出して自動実装する仕組み。
トークン制限で実装が中断しても、次回の cron 実行から続きを再開できる。

> 📊 **システム全体図**: [`docs/claude-code-system.drawio`](./claude-code-system.drawio)（Draw.io / VS Code 拡張で開く）

---

## 全体の流れ

```
① GitHub Issue を作成（ラベル: implementation-ready、マイルストーン設定）
      ↓
② cron が auto-implement.sh を定期実行
      ↓
③ スクリプトが「最小マイルストーン番号 → 最小 Issue 番号」で次の実装対象を選択
      ↓
④ Issue に "auto-implement: in-progress" ラベルを付与
      ↓
⑤ claude --print で実装を依頼（ブランチ作成 → TDD → コミット → PR 作成まで）
      ↓
⑥ Claude が exit 0 → PR 存在確認（タイトル / ブランチ名）
   PR あり → "auto-implement: done" ラベル
   PR なし → "auto-implement: blocked" ラベル + Issue にコメント
   Claude が exit 非0 → "auto-implement: blocked" ラベル + Issue にコメント
      ↓
⑦ 人間が PR をレビュー → マージ（Issue は自動クローズ）
      ↓
⑧ 次回 cron 実行で次の Issue を選択 → ④ に戻る
```

---

## Issue の作り方

### 必須設定

| 設定 | 内容 | 説明 |
|------|------|------|
| **ラベル** | `implementation-ready` | 実装準備完了を示す |
| **マイルストーン** | 任意（例: v1.1, Phase-1） | 実装順序を制御する |

### ラベルの意味

| ラベル | 意味 | 設定者 |
|--------|------|--------|
| `implementation-ready` | 実装可能な状態（要件明確）| 人間 |
| `auto-implement: in-progress` | 現在 Claude が実装中 | スクリプト自動 |
| `auto-implement: done` | Claude が実装完了 **かつ PR 存在確認済み** | スクリプト自動 |
| `auto-implement: blocked` | 自動実装失敗。手動対応が必要 | スクリプト自動 |

### Issue の書き方（推奨）

Claude が実装しやすいように、以下を含める:

```markdown
## 概要
〇〇の機能を追加する

## 背景・目的
なぜこの機能が必要か

## 受け入れ条件
- [ ] 〇〇ができること
- [ ] 〇〇のテストが通ること
- [ ] エラー時に適切なレスポンスを返すこと

## 実装ヒント（任意）
- 参考にするファイル: lambda/create_record/handler.py
- 使用する AWS サービス: 〇〇
```

テンプレートは `docs/templates/issue-feature.md` を参照。

---

## 実装順序の制御（マイルストーン）

```
Milestone: Phase-1（番号が小さい = 先に実装）
  ├── Issue #10: ダッシュボード基盤の実装
  ├── Issue #11: 週次グラフコンポーネント
  └── Issue #15: 傾向グラフ（月次）

Milestone: Phase-2（Phase-1 完了後に着手）
  ├── Issue #20: AI アドバイス機能
  └── Issue #21: 異常検知アラート
```

**スクリプトは「マイルストーン番号が最小 → Issue 番号が最小」の順で選択する。**

---

## 手動実行

```bash
# 動作確認（Claude を呼ばない）
bash scripts/auto-implement.sh --dry-run

# 通常実行
bash scripts/auto-implement.sh

# モデルを指定
bash scripts/auto-implement.sh --model opus

# Issue 番号を直接指定
bash scripts/auto-implement.sh --issue 42
```

---

## cron 設定

### WSL の cron を使う（推奨）

```bash
# cron サービスを起動
sudo service cron start

# crontab を編集
crontab -e
```

以下を追記:

```cron
# 毎日 AM 3:00 に自動実装を実行（1 Issue ずつ）
0 3 * * * cd ~/dev/health-logger/health-logger && bash scripts/auto-implement.sh >> /tmp/auto-implement.log 2>&1

# 毎日 AM 3:30 にも実行（1日に最大2 Issue）
30 3 * * * cd ~/dev/health-logger/health-logger && bash scripts/auto-implement.sh >> /tmp/auto-implement.log 2>&1
```

> **なぜ1回1 Issue か**: Claude の実装には数分〜十数分かかる場合がある。
> トークン制限に当たっても1 Issue で止まるため、他の Issue への影響がない。

### Windows タスクスケジューラを使う場合

```powershell
$action = New-ScheduledTaskAction -Execute "wsl.exe" `
  -Argument "-e bash -c `"cd ~/dev/health-logger/health-logger && bash scripts/auto-implement.sh >> /tmp/auto-implement.log 2>&1`""
$trigger = New-ScheduledTaskTrigger -Daily -At "03:00"
Register-ScheduledTask -TaskName "health-logger: Auto Implement" -Action $action -Trigger $trigger
```

---

## ログの確認

```bash
# リアルタイムで確認
tail -f /tmp/auto-implement.log

# 直近の実行結果を確認
tail -100 /tmp/auto-implement.log

# エラーのみ確認
grep ERROR /tmp/auto-implement.log
```

---

## トラブルシューティング

### Issue が選ばれない

```bash
# open マイルストーンを確認（gh milestone は古いバージョンで非対応のため gh api を使用）
gh api repos/rikunisikawa/health-logger/milestones?state=open --jq '.[].title'

# 対象 Issue を確認（マイルストーン番号を指定）
gh api "repos/rikunisikawa/health-logger/issues?state=open&milestone=1&per_page=20" \
  --jq '.[] | {number: .number, title: .title, labels: [.labels[].name]}'
```

> **注意**: gh CLI 2.4.0 では `gh label`・`gh milestone`・`gh issue list --json` の組み合わせが
> 動作しない場合があります。スクリプトは `gh api` で直接 GitHub REST API を呼び出しています。

### 実装が途中で止まった（トークン制限）

`auto-implement: in-progress` ラベルが残ったままの Issue がある場合:

```bash
# ラベルを手動で削除して次回 cron で再実行させる
gh issue edit <ISSUE_NUMBER> --remove-label "auto-implement: in-progress"
```

### `done` ラベルが付いているのに PR が存在しない

`claude` が exit 0 で終了したが PR が作成されなかった場合に発生していた（レート制限での早期終了など）。
現在のスクリプトは exit 0 後に PR 存在確認を行うため、**この状況は発生しなくなっている**。

万一 `done` ラベルのまま Issue がオープンになっている場合:

```bash
# done ラベルを削除して implementation-ready に戻す
gh issue edit <ISSUE_NUMBER> --remove-label "auto-implement: done"
# → 次回 cron で再選択される
```

### blocked になった Issue を再試行

```bash
# blocked ラベルを外す → 次回 cron で再選択される
gh issue edit <ISSUE_NUMBER> --remove-label "auto-implement: blocked"

# または直接実行
bash scripts/auto-implement.sh --issue <ISSUE_NUMBER>
```

### 別のブランチで PR がすでにある場合

Claude は既存 PR を検出して重複作成しないよう実装されているが、
念のため PR の有無を確認:

```bash
gh pr list --search "Closes #<ISSUE_NUMBER>"
```

---

## 設計上の判断

| 決定事項 | 内容 | 理由 |
|---------|------|------|
| 1回1 Issue | 1回の cron 実行で1 Issue のみ実装 | トークン制限の影響を最小化 |
| PR ベース | Issue を直接クローズせず、PR マージで自動クローズ | 人間のレビューを必須にする |
| マイルストーン順 | 実装順序はマイルストーン番号で制御 | 依存関係を管理しやすくする |
| ラベルで状態管理 | in-progress / done / blocked でトラッキング | GitHub 上で状態が一目でわかる |
| PR 存在確認 | exit 0 後に PR の存在を検証してから done ラベルを付与 | exit 0 でも PR 未作成のケース（レート制限での早期終了など）を防ぐ |
| `--permission-mode bypassPermissions` | Claude がファイル編集・git・gh を自由に使える | 実装作業に必要な全操作を許可 |

---

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `scripts/auto-implement.sh` | メインスクリプト |
| `docs/product/vision.md` | 実装する機能の戦略的背景 |
| `docs/ai-pm/sprint-current.md` | 現在のスプリント状態 |
| `docs/templates/issue-feature.md` | Issue 作成テンプレート |
| `.claude/commands/implement.md` | `/implement` コマンド定義 |
