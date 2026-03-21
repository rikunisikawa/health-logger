# Claude Code 基本使用ガイド

## 概要

Claude Code は Anthropic が提供する CLI ベースの AI コーディングアシスタントです。
ターミナルから直接起動し、コードの読み書き・テスト実行・Git 操作などをインタラクティブに行えます。

---

## インストールと起動

```bash
# インストール（npm 経由）
npm install -g @anthropic-ai/claude-code

# 起動（プロジェクトディレクトリで実行）
cd /path/to/your/project
claude
```

---

## 基本的なインタラクション

Claude Code はチャット形式で操作します。自然言語で指示を出すと、Claude がコードを読み・書き・実行します。

### 典型的な使い方

```
# ファイルの説明を求める
> このファイルの処理を説明して

# バグ修正を依頼する
> test_handler.py の失敗しているテストを修正して

# 新機能を追加する
> Pydantic モデルに email フィールドを追加して

# リファクタリング
> handler.py の重複コードを関数に切り出して
```

---

## スラッシュコマンド

`/` で始まるコマンドで Claude Code の機能を操作します。

| コマンド | 説明 |
|---------|------|
| `/help` | ヘルプ表示 |
| `/clear` | 会話履歴をクリア（コンテキストをリセット） |
| `/compact` | 会話を要約してコンテキストを圧縮 |
| `/status` | 現在の設定・モデル・使用状況を表示 |
| `/model` | 使用するモデルを変更 |
| `/fast` | Fast モードのトグル（高速出力） |
| `/cost` | 現セッションのトークン使用量・コストを表示 |
| `/vim` | Vim キーバインドのトグル |
| `/terminal-setup` | ターミナル向けシェル統合をインストール |
| `/init` | `CLAUDE.md` を生成（プロジェクト設定ファイル） |
| `/login` | Anthropic アカウントでログイン |
| `/logout` | ログアウト |
| `/bug` | バグ報告を送信 |

---

## パーミッションモード

Claude Code はファイル操作・コマンド実行の許可レベルを制御できます。

### 起動時オプション

```bash
# デフォルト（危険な操作は都度確認）
claude

# 全操作を自動承認（確認プロンプトなし）
claude --dangerously-skip-permissions

# 特定ツール・コマンドのみ自動承認
claude --allowedTools "Bash(npm run test),Edit,Read"
```

### 実行中の承認

Claude がツールを呼び出す際、ターミナルに承認プロンプトが表示されます。

```
Claude wants to run: git push origin HEAD
[y/n/always/never]:
```

| 入力 | 動作 |
|-----|------|
| `y` | 今回のみ許可 |
| `n` | 拒否（Claude は別の方法を検討） |
| `always` | 今後このコマンドを常に自動承認 |
| `never` | 今後このコマンドを常に拒否 |

### 自動承認モードの詳細

#### `--dangerously-skip-permissions` フラグ

全ツール・コマンドの確認をスキップします。
CI/CD パイプラインや、信頼できる自動化スクリプト内での利用を想定しています。

```bash
# 例: CI 環境でテストと修正を自動実行
claude --dangerously-skip-permissions 
```

> **注意**: ファイルの削除・上書き・外部サービスへのリクエストなども確認なしで実行されます。
> ローカル開発中はデフォルトモード（確認あり）の使用を推奨します。

#### `--allowedTools` で許可範囲を絞る

特定のツールやコマンドのみ自動承認し、それ以外は都度確認させる方法です。
`--dangerously-skip-permissions` より安全に自動化できます。

```bash
# 書き込み系は確認なし、読み取りは常に許可
claude --allowedTools "Edit,Read,Bash(npm run test),Bash(npm run build)"

# Bash コマンドを個別に列挙する
claude --allowedTools "Bash(pytest lambda/ -v),Bash(npx tsc --noEmit),Read,Glob,Grep"
```

書式:
- `Edit` / `Read` / `Glob` / `Grep` — ツール名をそのまま指定
- `Bash(コマンド)` — 特定の Bash コマンドのみ許可（前方一致）

#### `always` / `never` による実行時の永続設定

実行中のプロンプトで `always` または `never` を入力すると、
その設定が `~/.claude/settings.json` に保存され、次回以降も有効になります。

```json
// ~/.claude/settings.json に自動追記される例
{
  "allowedTools": ["Bash(npm run test)", "Edit"],
  "deniedTools": ["Bash(git push --force)"]
}
```

設定を見直したい場合は、このファイルを直接編集してください。

---

## CLAUDE.md（プロジェクト設定）

プロジェクトルートに `CLAUDE.md` を置くと、Claude は毎回その内容を読み込みます。
プロジェクト固有のルール・コマンド・禁止事項などを記述します。

```bash
# 自動生成
claude /init
```

### 記載内容の例

```markdown
## 開発コマンド
- テスト: pytest lambda/ -v
- 型チェック: cd frontend && npx tsc --noEmit

## 禁止事項
- terraform apply は必ずユーザー確認後に実行
- git add -A は使わない
```

---

## メモリ（記憶の永続化）

Claude Code はセッションをまたいで情報を記憶できます。

### メモリファイルの場所

| スコープ | パス |
|---------|------|
| グローバル | `~/.claude/MEMORY.md` |
| プロジェクト | `~/.claude/projects/<project-path>/memory/MEMORY.md` |

### 使い方

```
# 覚えておくよう明示的に依頼する
> このプロジェクトでは常に bun を使うことを覚えておいて

# 忘れるよう依頼する
> npm を使うというメモリを消して
```

---

## キーバインド

| キー | 動作 |
|-----|------|
| `Enter` | メッセージ送信 |
| `Shift + Enter` | 改行（複数行入力） |
| `Ctrl + C` | 現在の処理をキャンセル |
| `Ctrl + D` | Claude Code を終了 |
| `Up / Down` | 入力履歴を移動 |
| `Ctrl + R` | 入力履歴をインクリメンタル検索 |

---

## マルチライン入力

長い指示や複数行のコードを貼り付けるには Shift+Enter で改行します。

```
> 以下の要件で実装してください:
  1. Pydantic v2 でバリデーション
  2. エラーは 422 で返す
  3. UUID は正規表現で事前検証
```

---

## Plan モード

実装前に計画を立てて確認したい場合は Plan モードを使います。

```
# Plan モードに入る
> /plan

# または指示の中で使う
> 実装する前にプランを提示して
```

Claude は実際のファイル変更を行わず、実施予定の手順を列挙します。
承認すると実装に移ります。

---

## Git 連携

Claude Code は Git コマンドを直接実行できます。

```
# 一般的な Git ワークフロー
> feature/add-email ブランチを切って、メールフィールドを追加して、コミットして

# PR 作成（gh CLI 使用）
> 変更内容を PR にして
```

---

## 並列実行と worktree

複数のターミナルで Claude Code を同時に動かすと、**ブランチの切り替えやファイルの変更が互いに干渉**することがあります。
`--worktree` オプションを使うと、セッションごとに独立した作業ディレクトリを作成できます。

### 問題：並列実行時の干渉

```
ターミナル A                        ターミナル B
feat/120 ブランチで作業中         →  git switch fix/126 を実行
         ↑
         A の未コミット変更が消える可能性がある
```

### 解決策：`--worktree` オプション

`-w` / `--worktree` を付けて起動すると、Claude Code が自動で git worktree を作成し、
**メインの作業ツリーとは独立したディレクトリ**でセッションを開始します。

```bash
# 名前を自動生成して worktree を作成
claude -w

# 名前を指定して worktree を作成
claude -w fix-login-bug
```

起動すると以下が自動で行われます：

1. `git worktree add` で新しい作業ディレクトリを作成
2. そのディレクトリで Claude Code セッションを開始
3. セッション終了後に worktree を自動削除

### worktree での並列実行イメージ

```
~/dev/health-logger/health-logger/       ← メイン（ターミナル A）
  └── .git/

/tmp/claude-worktrees/fix-login-bug/    ← worktree（ターミナル B）
  └── .git → メインの .git を参照
```

ブランチとファイルが完全に分離されるため、互いの操作が干渉しません。

### 注意事項

- worktree 内のブランチはメインと**同じリポジトリの別ブランチ**である必要があります
  （同じブランチを2つの worktree で同時に開くことはできません）
- `--tmux` と組み合わせると、worktree ごとに tmux ペインを自動作成できます（WSL では要 tmux インストール）

```bash
# tmux ペインを自動作成（tmux が必要）
claude -w --tmux
```

---

## よく使う指示パターン

### コードを理解する

```
> このファイルの処理フローを説明して
> get_latest/handler.py で SQL インジェクション対策はどうなっているか確認して
> このエラーの原因を調べて: [エラーメッセージを貼り付け]
```

### コードを修正する

```
> テストが失敗している。原因を調べて修正して
> mypy のエラーを全て修正して
> この関数のエッジケースを洗い出してテストを追加して
```

### リファクタリング

```
> handler.py の重複コードを共通化して
> Pydantic v1 の書き方を v2 に移行して
> 型アノテーションを追加して
```

### インフラ（Terraform）

```
> terraform validate のエラーを修正して
> terraform plan の差分を確認して（apply はしない）
> このリソースの依存関係を説明して
```

---

## マルチエージェント（Agent Teams）

複数の専門エージェントが並列で協調しながら作業する機能です。
このプロジェクトでは `.claude/agents/` に10種のエージェントが定義されています。

### orchestrator を使う

```bash
# 通常の起動に --agent orchestrator を追加するだけ
claude --dangerously-skip-permissions --agent orchestrator
```

`--dangerously-skip-permissions` はそのまま残してよいです。
orchestrator がタスクを分析し、適切な専門エージェント（frontend / lambda / devops 等）に並列委譲します。

### 専門エージェントを直接指定する

特定の作業に絞りたい場合は直接起動できます。

```bash
# フロントエンドの作業のみ
claude --dangerously-skip-permissions --agent frontend

# Lambda の実装・テストのみ
claude --dangerously-skip-permissions --agent lambda

# Terraform の計画・確認のみ
claude --dangerously-skip-permissions --agent devops
```

### エージェント一覧

| エージェント | 用途 |
|------------|------|
| `orchestrator` | タスク分解・各エージェントへの委譲（起点として使う） |
| `frontend` | React/TypeScript コンポーネント・フック・ビルド |
| `lambda` | Python Lambda 実装・Pydantic モデル・pytest |
| `devops` | Terraform plan・GitHub Actions・デプロイ |
| `data_engineering` | Firehose/Iceberg/Athena パイプライン・DDL |
| `analysis` | Athena SQL で健康・環境データ分析 |
| `testing` | テスト戦略・セキュリティレビュー |
| `architecture` | 設計判断・AWS サービス選定・トレードオフ評価 |
| `documentation` | README・CLAUDE.md・仕様書の作成・更新 |
| `project_management` | Issue・PR・ブランチ・マージ管理 |

### 注意事項

- Agent Teams は実験機能（Claude Code v2.1.32 以上が必要）
- `/resume` でセッションを再開するとチームメンバーは復元されない
  → 大きなタスクは一気に完了まで走らせるのが安全

---

## Tips

### コンテキストが長くなったら

長いセッションでは `/compact` でコンテキストを圧縮するか、
`/clear` でリセットして新しい会話として始めると精度が上がります。

### 指示は具体的に

```
# 曖昧（避ける）
> コードを改善して

# 具体的（推奨）
> create_record/handler.py の _validate_uuid 関数に、無効な UUID が渡された場合の
  ログ出力を追加して。ログレベルは WARNING で。
```

### 複数ファイルの変更

Claude は依存関係を考慮して複数ファイルを同時に変更できます。

```
> RecordModel に `source` フィールドを追加して。
  models.py・handler.py・test_handler.py すべて更新して。
```

### 作業を途中で止める

`Ctrl + C` で現在の処理を中断できます。
ファイルが途中まで書き換えられた場合は、Git で状態を確認してください。

```bash
git diff        # 変更内容の確認
git checkout .  # 変更の破棄
```

---

## トラブルシューティング

### 認証エラー

```bash
claude /logout
claude /login
```

### コンテキストが壊れた・挙動がおかしい

```
> /clear
```

### ツール呼び出しが拒否されてループする

Claude が同じ操作を繰り返し試みる場合は `Ctrl + C` で中断し、
別のアプローチを指示してください。

---

## 参考リンク

- 公式ドキュメント: https://docs.anthropic.com/claude-code
- バグ報告: https://github.com/anthropics/claude-code/issues
