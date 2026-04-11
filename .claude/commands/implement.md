---
description: Issue番号を受け取り、ブランチ作成→TDD→実装→テスト確認→コミット→PRまでの開発サイクルを一貫して実行する。
---

# /implement — 開発サイクル実行

Issue番号: $ARGUMENTS

---

## ステップ 1: Issue の内容を確認し、スキーマ・インターフェースを調査する

```bash
gh issue view $ARGUMENTS --repo rikunisikawa/health-logger
```

- タイトル・背景・完了条件・成果物ファイルを把握する
- 変更対象のファイルを特定し、現在のコードを読む

**Lambda（Athena クエリを変更・追加する場合は必須）:**
- `docs/DATABASE_SCHEMA.md` でテーブルスキーマ・カラム名・型を確認する
- Iceberg の `dt` カラムはパーティションキーのため WHERE 句で直接使用不可（`DATE(recorded_at)` を使う）
- 新しいカラム参照・SQL 式を使う前に、Glue カタログに存在するカラム名か確認する

**フロントエンド（API 呼び出しを変更・追加する場合）:**
- `docs/API_REFERENCE.md` でエンドポイント仕様・クエリパラメータ・レスポンス型を確認する
- `frontend/src/types.ts` の型定義と API レスポンスの整合性を確認する

---

## ステップ 2: main を最新化してブランチを作成する

```bash
git switch main && git pull origin main
git switch -c feature/<Issue番号>-<簡潔な説明>
```

ブランチ命名規則:
| prefix | 用途 |
|--------|------|
| `feature/` | 新機能追加 |
| `fix/` | バグ修正 |
| `chore/` | 設定・依存・リファクタ |
| `terraform/` | インフラ変更のみ |

---

## ステップ 3: RED — 失敗テストを先に書く

> **重要**: テストは実装の「写し」になってはいけない。
> 「何が正しい動作か」をスキーマ・仕様から先に決め、それを assert するテストを書く。
> 実装前に pytest を実行して **FAILED（RED）になることを必ず確認する。**
> FAILED にならない場合はテストが実装を検証できていない可能性がある。

**Lambda（Python）:**
```bash
pytest lambda/<fn>/test_handler.py -v
# → FAILED であることを確認してから実装へ進む
```

テストで必ずカバーすること:
- 正常系（期待するステータスコード・レスポンスボディ）
- バリデーションエラー（不正な user_id・不正なパラメータ）
- AWS サービスエラー（Firehose 失敗・Athena タイムアウト等）

**Athena クエリを追加・変更する場合は追加で必須:**
- 生成される SQL 文字列を `call_args[1]["QueryString"]` で取り出してアサートする
- 正しいカラム名・式が含まれているか（例: `DATE(recorded_at)` vs `dt`）
- 誤った式が含まれていないか（`assert "dt >=" not in qs` のような否定アサートも書く）

**フロントエンド（TypeScript）:**
```bash
npx tsc --noEmit
# → 型エラーが出る状態でOK（型定義だけ先に書く）
```

---

## ステップ 4: GREEN — 最小実装でテストを通す

実装チェックリスト:

**Python Lambda:**
- [ ] `user_id` を UUID 正規表現で検証（`_UUID_RE.match()`）
- [ ] 新規パラメータも正規表現で検証（SQLインジェクション防止）
- [ ] Pydantic v2 モデルは `models.py` に分離（`handler.py` に書かない）
- [ ] boto3 クライアントはモジュールレベルで初期化
- [ ] エラーレスポンスは `_json(status, body)` ヘルパーで統一

**TypeScript フロントエンド:**
- [ ] `strict: true` を維持（`tsconfig.json` を緩めない）
- [ ] 環境変数は `import.meta.env.VITE_*` 経由
- [ ] IndexedDB は `useOfflineQueue` フック経由のみ

```bash
# Lambda
pytest lambda/<fn>/test_handler.py -v   # 全件 PASSED を確認

# フロントエンド
npx tsc --noEmit                         # エラーなしを確認
```

---

## ステップ 5: 全テストスイートを通す

```bash
# Lambda 全体
pytest lambda/ -v

# フロントエンド ビルド確認
cd frontend && npm run build
```

1件でも FAILED / ビルドエラーがあれば修正してから次へ進む。

---

## ステップ 6: コードレビュー（/code-review）

差分全体を `/code-review` の観点でセルフチェックする:

- [ ] シークレット漏洩なし
- [ ] SQL インジェクション対策済み（新規パラメータを含む）
- [ ] `strict: true` 維持
- [ ] `sensitive = true` 付与（Terraform 変数が対象の場合）

問題があれば修正してステップ 5 に戻る。

---

## ステップ 7: コミット

```bash
# 対象ファイルを個別にステージング（git add -A は使わない）
git add <ファイル1> <ファイル2> ...

git commit -m "<type>: <変更内容の要約>"
```

コミットタイプ:
| type | 用途 |
|------|------|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `test` | テスト追加・修正 |
| `refactor` | リファクタ |
| `chore` | 設定・依存更新 |

---

## ステップ 8: PR を作成する

```bash
git push -u origin <ブランチ名>

gh pr create \
  --repo rikunisikawa/health-logger \
  --title "<変更内容>" \
  --body "$(cat <<'EOF'
## 関連イシュー
Closes #$ARGUMENTS

## 変更内容
- ...

## テスト確認
- [ ] pytest lambda/ -v → 全件 PASSED
- [ ] npx tsc --noEmit → エラーなし
- [ ] npm run build → 成功

## レビュー観点
- ...
EOF
)"
```

---

## 完了確認

- [ ] CI（GitHub Actions）が通過している
- [ ] Issue の完了条件をすべて満たしている
- [ ] PR に `Closes #$ARGUMENTS` が含まれている
