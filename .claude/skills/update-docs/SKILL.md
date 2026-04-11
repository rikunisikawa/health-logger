---
name: update-docs
description: 実装変更を検知し、対応するドキュメントの更新が必要な箇所を特定する PM スキル。変更ファイルと既存ドキュメントを照合し、更新候補と更新案を提示する。PR 作成時や documentation エージェントがドキュメントを更新するときに自動参照される。
user-invocable: false
---

# update-docs スキル

## 目的

コードの変更に対して「どのドキュメントを更新すべきか」を特定し、
更新候補と更新内容の草案を提示する。実際の更新は人間または documentation エージェントが行う。

## 入力

- PR の diff または変更ファイルのリスト
- 省略時: `git diff main...HEAD --name-only` で取得

## 出力

- 更新が必要なドキュメントのリスト
- 各ドキュメントの更新内容の草案

## 変更ファイルと対応ドキュメントのマッピング

| 変更ファイル | 更新が必要なドキュメント |
|-------------|------------------------|
| `lambda/*/handler.py` の API 変更 | `docs/API_REFERENCE.md` |
| `lambda/*/handler.py` の新規追加 | `docs/LAMBDA_DEVELOPMENT.md` |
| `terraform/modules/*/` | `docs/infrastructure.drawio`, `docs/DEPLOYMENT_GUIDE.md` |
| `frontend/src/api.ts` | `docs/API_REFERENCE.md`, `docs/FRONTEND_DEVELOPMENT.md` |
| `data/dbt/models/` | `docs/data-lineage.md`, `docs/dbt-design.md` |
| `lambda/*/models.py` の Pydantic モデル変更 | `docs/DATABASE_SCHEMA.md` |
| `.github/workflows/` | `docs/DEPLOYMENT_GUIDE.md` |
| `.claude/` 配下 | `docs/claude-code-setup.md`, `docs/claude-code-usage.md` |

## 実行手順

### Step 1: 変更ファイルの取得

```bash
git diff main...HEAD --name-only
```

### Step 2: ドキュメント更新候補の特定

変更ファイルとマッピングテーブルを照合して更新候補を列挙する。

### Step 3: 更新内容の草案提示

```markdown
## ドキュメント更新候補

### 要更新（変更あり）

**docs/API_REFERENCE.md**
- `POST /records` のリクエストボディに `custom_fields` フィールドが追加された
- 更新箇所: 「リクエストパラメータ」セクションの Pydantic スキーマ

**docs/DATABASE_SCHEMA.md**
- `HealthRecord` モデルに `source_app` フィールドが追加された

### 確認が必要（変更があった可能性）

**docs/DEPLOYMENT_GUIDE.md**
- Lambda 関数が追加されたため、デプロイ手順の更新が必要か確認

### 更新不要

**docs/TROUBLESHOOTING.md** — 今回の変更範囲外
```

## 禁止事項

- ユーザー確認なしのドキュメント自動更新
- コードファイルの変更

## 実行例

```
「update-docs スキルを使って PR #15 の変更に対応するドキュメントを確認して」
「今回の変更でどのドキュメントを更新すべきか教えて」
```
