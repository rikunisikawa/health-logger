# Claude Code 開発環境 改善レポート

生成日時: 2026-03-21 (手動実行 / スキル活用)
生成方法: `dev-env-review` スキル + 公式ドキュメント参照

## 参照した公式ドキュメント

| ドキュメント | URL | 参照状況 |
|-----------|-----|--------|
| Settings | https://code.claude.com/docs/en/settings | ✅ 参照可 |
| Hooks | https://code.claude.com/docs/en/hooks | ✅ 参照可 |
| MCP | https://code.claude.com/docs/en/mcp | ✅ 参照可 |
| Memory (CLAUDE.md) | https://code.claude.com/docs/en/memory | ✅ 参照可 |
| Sub-agents | https://code.claude.com/docs/en/sub-agents | ✅ 参照可 |

## 現状サマリー

プロジェクトの Claude Code 開発環境は **全体的に良好**な状態です。CLAUDE.md、agents、skills、commands、rules が体系的に構成され、セキュリティルールや開発フロー指示が明確に定義されています。ただし、以下の点で軽微な改善の余地があります：

1. **.mcp.json ファイルが存在しない** (settings.json では MCP サーバーを参照)
2. **hooks のコマンドが絶対パス** (CI 環境での再利用を考慮すると相対パス推奨)
3. **git-push-reminder.py の出力形式が古い可能性** (Hook フィードバック形式の見直し)

## 改善案

### A. CLAUDE.md

**評価:**
- ✅ 構成が明確（プロジェクト概要・開発コマンド・コーディング規約・禁止事項がカバーされている）
- ✅ 重要な禁止事項が明示されている（`terraform apply` 禁止、app/ と terraform/envs/dev/ 編集禁止）
- ✅ 開発フロー（Issue→branch→TDD→commit→PR）の記述がある
- ✅ 約 150 行で適正（コンテキスト消費量良好）

**改善案:**
1. 開発環境レビュー節に `.claude/prompts/dev-env-review.md` への参照を追加
2. CI 実行時の制約を「重要な禁止事項」に追記

**優先度:** 低 | **工数感:** 10 分

---

### B. settings.json

**評価:**
- ✅ `defaultMode: "acceptEdits"` → 適切
- ✅ `allow` / `deny` リスト が体系的・網羅的
- ⚠️ Hooks コマンドが**絶対パス**になっている → **相対パス推奨**
- ⚠️ `enabledMcpjsonServers` 設定があるが `.mcp.json` ファイルが存在しない

**改善案:**

1. **Hooks の絶対パスを相対パスに変更**:
   - **現在：** `"command": "python3 /home/riku_nishikawa/dev/health-logger/health-logger/.claude/hooks/block-forbidden-dirs.py"`
   - **推奨：** `"command": "python3 .claude/hooks/block-forbidden-dirs.py"`
   - **理由:** CI 環境や他のユーザーでも動作。全 3 つの hooks コマンド修正。

2. **`.mcp.json` ファイルを作成**:
   - MCP サーバー設定を一元管理（settings.json の冗長性排除）

3. **不要な MCP サーバーの無効化**:
   - `mermaid` / `drawio` は常時有効だと context 消費増加

**優先度:** 高 | **工数感:** 20 分

---

### C. Hooks

**評価:**
- ✅ 3 つの hook が体系的に機能（禁止ディレクトリ・git push 警告・テスト自動実行）
- ✅ Exit code 2（ブロック）/ 0（許可）の適切な使い分け
- ⚠️ `git-push-reminder.py` の出力形式が old-style JSON の可能性

**改善案:**

1. **Hook 出力形式を公式 API に対応させる**:
   - `block-forbidden-dirs.py` / `git-push-reminder.py` の出力を最新フォーマットに

2. **`git-push-reminder.py` にシークレット検出ロジック追加**:
   - VAPID / PAT / AWS 秘密鍵の grep 実装

**優先度:** 中 | **工数感:** 30 分

---

### D. MCP サーバー

**評価:**
- ⚠️ `.mcp.json` ファイルが存在しない
- ⚠️ settings.json で `enabledMcpjsonServers` が定義されているが対応ファイルなし

**改善案:**

1. **`.mcp.json` ファイルを作成**:
   ```json
   {
     "mcpServers": {
       "filesystem": { "command": "python3", "args": ["-m", "mcp.server.filesystem"] },
       "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] },
       ...
     }
   }
   ```

2. **AWS region / profile の環境変数設定**:
   - `AWS_PROFILE=${AWS_PROFILE:-default}`, `AWS_REGION=ap-northeast-1`

**優先度:** 中 | **工数感:** 15 分

---

### E. Agents / Skills / Commands

**評価:**
- ✅ **Agents:** 10 個が役割明確に分離（全スタック カバー）
- ✅ **Skills:** 9 個が技術ドメイン別に整理
- ✅ **Commands:** 6 個が開発フロー support
- ✅ **Rules:** Python / TypeScript / Terraform / dbt セキュリティルール完備
- ⚠️ Agents ツール制限が重複気味（`Read, Glob, Grep, Bash` が多い）

**改善案:**
- Agents ツール制限の精密化（エージェント間のコンテキスト汚染防止）

**優先度:** 低 | **工数感:** 30 分

---

### F. セキュリティ

**評価:**
- ✅ Hooks で `app/` / `terraform/envs/dev/` への書き込みをブロック
- ✅ AWS 破壊的操作が一括ブロック
- ✅ MEMORY.md にシークレット管理ガイドあり
- ⚠️ `git-push-reminder.py` が「シークレット検出」を謳っているが未実装

**改善案:**
- `git-push-reminder.py` に regex-based シークレット検出を追加

**優先度:** 中 | **工数感:** 20 分

---

### G. コスト最適化

**評価:**
- ⚠️ `mermaid` / `drawio` MCP は常時有効（使用頻度が低いなら無効化推奨）

**改善案:**
- 不要な MCP サーバーを無効化（context 消費削減）
- 定期実行スクリプトのモデルを `--model haiku` が default に（コスト 1/3）

**優先度:** 低 | **工数感:** 15 分

---

### H. 今後の拡張案

1. **Subagent Memory の有効化**: Agents に `memory: project` 設定
2. **CI/CD hooks の拡張**: GitHub Actions 統合
3. **Agent Teams の本格運用**: 試験段階（様子見推奨）

**優先度:** 全て低 | **検討フェーズ**

---

## 優先度マトリクス

| 優先度 | 改善項目 | 工数感 | 理由 |
|--------|---------|--------|------|
| 🔴 高 | B-1: Hooks の絶対パス → 相対パス化 | 5 分 | CI 環境での再利用性向上 |
| 🔴 高 | B-2 / D: `.mcp.json` ファイル作成 | 15 分 | MCP 設定一元管理 |
| 🟡 中 | C: Hook 出力形式を最新化 | 30 分 | API 推奨フォーマット |
| 🟡 中 | F: `git-push-reminder.py` シークレット検出 | 20 分 | セキュリティ向上 |
| 🟢 低 | A: CLAUDE.md 補足追加 | 10 分 | ドキュメント充実 |
| 🟢 低 | E: Agents ツール制限精密化 | 30 分 | context 効率化 |
| 🟢 低 | G: コスト最適化 | 15 分 | 継続的改善 |

## 不明点・確認が必要な事項

1. **.mcp.json 非存在の理由？** 意図的 vs 忘れ → リコメンデーション：新規作成
2. **`mermaid` / `drawio` 使用頻度？** 月 1 回未満なら無効化推奨
3. **Agent Teams 本番運用予定？** 試験段階で様子見推奨

---

## まとめ

開発環境は **基盤が堅実**。優先度の高い修正（hooks パス・`.mcp.json`）は簡単で、CI/CD 環境での再利用性が大幅向上します。

**最初に着手を推奨:**
1. ✅ Hooks の絶対パス → 相対パス化（5 分）
2. ✅ `.mcp.json` ファイル作成（15 分）
