# 自動開発サイクル

cron から起動し、各ロールエージェントにタスクを割り振り、成果物を蓄積して説明資料を自動生成する仕組み。

---

## 何をする仕組みか

```
cron / 手動
  ↓
automation/run_cycle.sh
  ↓
automation/orchestrator.py（状態機械）
  ├─ tasks/inbox/ → tasks/ready/ に昇格
  ├─ 依存解決・優先度順にタスクを選択
  ├─ claude --print でロール別プロンプトを実行
  │   ├─ product_manager: docs/product/ に成果物
  │   ├─ designer:        docs/design/ に成果物
  │   ├─ engineer:        lambda/ frontend/ に実装
  │   ├─ reviewer:        docs/qa/ にレビュー結果
  │   └─ explainer:       docs/explain/ にスライド原稿
  └─ tasks/{doing → review → done} に状態遷移
  ↓
automation/explainer.py（スライド原稿 JSON 生成）
  ↓
automation/generate_pptx.py（PowerPoint 生成）
```

---

## ディレクトリ構成

```
automation/
  orchestrator.py       # 状態機械・タスクディスパッチャ
  explainer.py          # スライド原稿 JSON 生成
  generate_pptx.py      # PowerPoint 生成
  run_cycle.sh          # cron エントリポイント
  prompts/              # ロール別プロンプトテンプレート
    designer.md
    engineer.md
    product_manager.md
    project_manager.md
    reviewer.md
    explainer.md

tasks/
  inbox/                # 新規タスク置き場
  ready/                # 実行待ち（orchestrator が自動昇格）
  doing/                # 実行中
  review/               # 人間承認待ち
  done/                 # 完了
  failed/               # 失敗（MAX_RETRY 超過）
  templates/task.yaml   # タスク YAML テンプレート
  examples/             # サンプルタスク

docs/
  product/              # PM 成果物（PRD・feature brief）
  design/               # Designer 成果物（画面設計書）
  engineering/          # Engineer 成果物（技術ドキュメント）
  qa/                   # Reviewer 成果物（レビュー結果）
  explain/              # Explainer 成果物（JSON・pptx）
```

---

## タスクの流れ

```
① tasks/inbox/<task_id>.yaml を作成
② orchestrator が inbox → ready に昇格
③ 依存解決・優先度順に選択 → doing に移動
④ claude --print でロール別プロンプトを実行
⑤ 成功 → review / 失敗 → ready（リトライ）→ failed
⑥ 人間が review タスクを確認 → 手動で done に移動
⑦ 全タスク完了後 explainer が説明資料を生成
```

### タスクのステータス一覧

| ステータス | 意味 |
|-----------|------|
| `inbox` | 新規タスク。次回 orchestrator 起動時に ready に昇格 |
| `ready` | 実行待ち（依存解決済み）|
| `doing` | orchestrator が実行中 |
| `review` | 実行完了・人間承認待ち |
| `done` | 完了 |
| `failed` | 最大リトライ（2回）超過 |
| `waiting_approval` | 明示的な人間承認が必要 |

---

## 実行方法

### タスクを登録する

```bash
# テンプレートをコピーして編集
cp tasks/templates/task.yaml tasks/inbox/task-$(date +%Y%m%d)-001.yaml
vim tasks/inbox/task-$(date +%Y%m%d)-001.yaml
```

### 手動実行

```bash
# 動作確認（Claude を実際に呼ばない）
bash automation/run_cycle.sh --dry-run

# 実際に実行（haiku モデル）
bash automation/run_cycle.sh

# モデル指定
bash automation/run_cycle.sh --model sonnet

# 最大サイクル数を制限
python3 automation/orchestrator.py --max-cycles 3
```

### explainer のみ実行（pptx 生成）

```bash
python3 automation/explainer.py
python3 automation/generate_pptx.py docs/explain/<cycle-id>.json
```

### python-pptx のインストール

```bash
pip install pyyaml python-pptx
```

---

## cron 設定例

```bash
crontab -e
```

```cron
# 毎週月曜 AM 9:00 に開発サイクルを実行
0 9 * * 1 cd ~/dev/health-logger/health-logger && bash automation/run_cycle.sh >> /tmp/dev-cycle.log 2>&1
```

---

## ロール一覧

| ロール | 担当 | 成果物 |
|--------|------|--------|
| `product_manager` | 課題整理・PRD 作成・優先順位付け | `docs/product/` |
| `project_manager` | タスク分解・依存整理・進行管理 | `tasks/inbox/` |
| `designer` | 画面要件・UX フロー・文言設計 | `docs/design/` |
| `engineer` | 実装・テスト・技術ドキュメント | `lambda/` `frontend/` |
| `reviewer` | 受け入れ条件チェック・品質判定 | `docs/qa/` |
| `explainer` | スライド原稿 JSON・pptx 生成 | `docs/explain/` |

---

## 安全策

| 安全策 | 内容 |
|--------|------|
| 最大サイクル数 | `--max-cycles`（デフォルト: 10）で無限ループを防止 |
| 最大リトライ | タスクあたり 2 回まで（超過は `failed/` に移動）|
| 人間承認ポイント | `review/` に移動したタスクは人間が確認してから `done/` に移動 |
| dry-run モード | `--dry-run` で Claude を呼ばずに状態遷移を確認できる |
| 危険操作の除外 | `--allowedTools` で aws・terraform・rm 等は除外 |

---

## 今後の拡張ポイント（Phase 2 / 3）

- **Phase 2**: pptx デザイン改善・reviewer の自動 approve 条件強化・ログ集約
- **Phase 3**: GitHub Actions への移植・MCP / Skills との連携・動画ナレーション原稿生成
