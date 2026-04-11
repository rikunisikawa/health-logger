---
name: release-check
description: デプロイ前の最終チェックリストを実行し、Go/No-go 判定を出す PM スキル。テスト・CI・open Issue・セキュリティの観点で確認し、問題があれば具体的な対処手順を提示する。/release-check コマンド実行時に自動参照される。
user-invocable: false
---

# release-check スキル

## 目的

リリース（main への merge / deploy）前に、デプロイして安全かどうかを確認する。
問題があれば具体的な対処手順を提示し、人間が最終判断を行う。

## 入力

- リリース対象ブランチ名（省略時: 現在のブランチ）
- 対象マイルストーン名（省略可）

## 出力

- Go / No-go 判定レポート
- 各チェック項目の結果
- 問題がある場合の対処手順

## チェックリスト

### 1. テスト

```bash
pytest lambda/ -v --tb=short
# → 全テスト PASSED であること
```

```bash
cd frontend && npx tsc --noEmit
# → 型エラー 0 件であること
```

### 2. CI/CD 状態

```bash
gh run list --limit 5 --json status,conclusion,name,headBranch
# → 直近のCIが PASSED または SKIPPED であること
```

### 3. open Issue の確認

```bash
gh issue list --milestone "<マイルストーン名>" --state open --json number,title
# → スプリントの必須 Issue がすべてクローズされているか
```

### 4. セキュリティ

```bash
# user_id バリデーション確認
grep -rn "user_id" lambda/ --include="*.py" | grep -v "UUID_RE\|validate\|test_"

# シークレットハードコード確認
grep -rn "AKIA\|ghp_\|sk-" lambda/ frontend/src/ --include="*.py" --include="*.ts" --include="*.tsx"
```

### 5. Terraform 確認（インフラ変更がある場合）

```bash
docker compose -f docker-compose.terraform.yml run --rm terraform \
  -chdir=terraform/envs/prod validate
docker compose -f docker-compose.terraform.yml run --rm terraform \
  -chdir=terraform/envs/prod plan -var='lambda_s3_keys={"create_record":"placeholder"}'
```

## 出力フォーマット

```markdown
## リリースチェック: YYYY-MM-DD

### 判定: ✅ GO / ❌ NO-GO

| チェック項目 | 結果 | 詳細 |
|------------|------|------|
| pytest 全通過 | ✅ | 42 tests passed |
| TypeScript 型エラー | ✅ | 0 errors |
| CI 最新実行 | ✅ | 3/3 passed |
| open Issue（必須） | ✅ | 0件残り |
| セキュリティスキャン | ✅ | 問題なし |
| Terraform validate | ✅ | 問題なし |

### NO-GO の場合の対処手順
（問題があれば具体的な手順を記載）
```

## 禁止事項

- **デプロイの実行**（人間のみ可）
- **NO-GO 状態での承認**
- `terraform apply` の実行（CLAUDE.md 禁止事項）
