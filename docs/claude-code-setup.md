# Claude Code 最適化戦略

health-logger プロジェクトにおける Claude Code の設定方針と構成を解説する。

---

## 設計方針

Claude Code の最大の制約は **コンテキストウィンドウ**。
会話・読み込んだファイル・コマンド出力がすべてコンテキストを消費するため、
「常に必要な情報」と「必要なときだけ読み込む情報」を明確に分離する。

```
常に読み込む  → CLAUDE.md（90行以内に厳選）
必要時に自動  → Skills（description で Claude が判断）
ツール実行時  → Hooks（deterministic な強制処理）
作業委任時    → Agents（sub-agent / Agent Teams 共用）
```

---

## ディレクトリ構成

```
.claude/
  agents/          # Sub-agent / Agent Teams のエージェント定義
  hooks/           # PreToolUse / PostToolUse スクリプト
  skills/          # 公式 Skills 形式（<name>/SKILL.md）
  settings.json    # 権限・Hooks・環境変数・MCP 設定
  settings.local.json  # ローカル上書き（git 管理外推奨）
CLAUDE.md          # プロジェクトルートに配置（毎セッション読み込み）
docs/
  claude-code-setup.md  # 本ドキュメント
```

---

## CLAUDE.md の設計

**原則：「コードを読めば分かること」は書かない。**

| 記載する内容 | 記載しない内容 |
|-------------|--------------|
| Claude が推測できない bash コマンド | ディレクトリ構成（コードから分かる） |
| デフォルトと異なるコーディング規約 | アーキテクチャ詳細（→ Skills へ） |
| 絶対に守らせたい禁止事項 | 開発フローの詳細（→ Skills へ） |
| terraform apply の確認義務 | GitHub Actions の詳細（yml を読めば分かる） |

現在の行数目安：**100行以内**（超えたら Skills への移動を検討）

---

## Skills の設計

公式仕様：`.claude/skills/<name>/SKILL.md`（ディレクトリ構造必須）

### フロントマターの使い分け

| フィールド | 用途 |
|-----------|------|
| `description` | Claude が自動ロードするかの判断基準（必ず書く） |
| `user-invocable: false` | 「参照知識」として自動ロード。`/` コマンドとしては呼び出せない |
| `disable-model-invocation: true` | 手動でのみ呼び出す（`/skill-name`）。Claude が自動発動しない |

### 現在のスキル一覧

| スキル | 種別 | 自動適用タイミング |
|--------|------|-----------------|
| `project-architecture` | 参照知識 | 設計・実装・インフラ変更時 |
| `aws-boto3` | 参照知識 | boto3 / Firehose / Athena 実装時 |
| `python-lambda` | 参照知識 | Lambda 関数の実装・テスト時 |
| `typescript-react` | 参照知識 | frontend/ 変更時 |
| `data-pipeline` | 参照知識 | Iceberg / Athena パイプライン変更時 |
| `terraform-iac` | 参照知識 | Terraform コード変更・plan 時 |
| `ci-cd` | 参照知識 | CI 失敗・ワークフロー変更時 |
| `git-workflow` | 参照知識 | ブランチ作成・コミット・PR 時 |

すべて `user-invocable: false`（background knowledge として機能）。

---

## Hooks の設計

**原則：「毎回例外なく実行すべき処理」にのみ使う。**
CLAUDE.md の文章ルールは advisory（守られないことがある）だが、
Hooks は deterministic（必ず実行される）。

### 現在の Hooks

#### PreToolUse：禁止ディレクトリへの書き込みブロック

```
トリガー: Write | Edit | MultiEdit
スクリプト: .claude/hooks/block-forbidden-dirs.py
対象: app/（Rails 参照用）、terraform/envs/dev/（放置環境）
動作: exit 2 でブロック + 理由を Claude にフィードバック
```

#### PostToolUse：Lambda 実装ファイル変更後に pytest 自動実行

```
トリガー: Write | Edit | MultiEdit
スクリプト: .claude/hooks/run-tests-after-edit.py
対象: lambda/**/*.py（test_*.py は除外）
動作: pytest lambda/ -v を実行し結果を表示
```

---

## Agents の設計

`.claude/agents/<name>.md` に定義。**Sub-agents と Agent Teams の両方で利用される。**

| 用途 | 動作 |
|------|------|
| **Sub-agents** | メインセッションが `"Use a subagent to..."` で委任。独立コンテキストで実行し結果を返す |
| **Agent Teams** | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 有効時、チームメンバーとして起動。Agent Teams は自然言語だけでも機能するが、`.claude/agents/` があればツール制限・system prompt が固定される |

### フロントマターの必須フィールド

```yaml
---
name: frontend
description: いつこのエージェントを使うかの説明（Claude の自動選択に使われる）
tools: Read, Edit, Write, Glob, Grep, Bash   # ツールを最小限に制限
---
```

### 現在のエージェント一覧

| エージェント | 担当 |
|-------------|------|
| `orchestrator` | タスク分析・エージェント選択・実行計画（現セッションの system prompt として機能） |
| `frontend` | React/TypeScript コンポーネント・フック実装 |
| `lambda` | Python Lambda 実装・pytest |
| `devops` | Terraform・インフラ変更 |
| `data_engineering` | Firehose / Iceberg / Athena パイプライン |
| `testing` | テスト設計・Red-Green サイクル管理 |
| `project_management` | Issue / PR / ブランチ / マージ |
| `architecture` | 設計レビュー・技術選定 |
| `analysis` | データ調査・Athena クエリ |
| `documentation` | ドキュメント作成・更新 |

---

## Agent Teams の使い方

```bash
# 新規セッションを起動
cd /path/to/health-logger
claude

# セッション内で依頼（自然言語のみで OK）
> frontend・lambda・devops の3人を作って、現在の実装を並列調査して
```

### 有効化設定

```json
// .claude/settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

- **表示モード**: デフォルト `auto`（tmux 内なら split-pane、それ以外は in-process）
- **tmux は不要**：in-process モードで `Shift+Down` によるメンバー切り替えが可能
- **チームメンバー選択**: `claude agents` で認識されているエージェント名で指定可能

---

## 権限設定

### Allow（確認なしで実行）

```
git *, gh *, npm *, npx *, pip *, pytest *, python *
docker compose ... terraform (init/validate/fmt/plan/output)
aws *, ls *, find *, echo *
Read, Edit, Write
```

### Deny（絶対ブロック）

```
terraform apply *, terraform destroy *
docker compose * terraform apply*, docker compose * terraform destroy*
git push --force *
aws * create-*, delete-*, remove-*, terminate-*, destroy-*
aws s3 cp/mv/rm/sync *
rm -rf /*
```

---

## MCP サーバー

| サーバー | 状態 | 用途 |
|---------|------|------|
| `filesystem` | ✅ | frontend/ と terraform/ のファイル操作 |
| `github` | ✅ | Issue / PR / リポジトリ操作 |
| `aws` | ✅ | AWS サービス操作 |
| `git` | ✅ | git log / diff / blame |
| `fetch` | ✅ | URL からドキュメント取得 |
| `mermaid` | ✅ | 図の生成 |
| `drawio` | ✅ | Draw.io 図の作成 |
| `terraform` | ❌ | Docker 起動失敗（CLI で代替） |
| `dbt` | ❌ | Athena 接続設定なし |

---

## コンテキスト管理のベストプラクティス

- **タスク切り替え時は `/clear`** でコンテキストをリセット
- **調査は sub-agent に委任**（`"Use a subagent to investigate..."` ）してメインを汚染しない
- **CLAUDE.md が 100 行を超えたら剪定**（Skills への移動を検討）
- **Hooks のエラーでメイン処理を止めない**（Hook スクリプトは `try/except` で握りつぶす）
