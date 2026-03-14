---
playbook: fix_bug
goal: バグを再現テスト → 原因特定 → 修正 → PR まで確実に解消する
agents_used: [analysis, testing, lambda, frontend, devops, project_management]
skills_used: [python_lambda, typescript_react, aws_boto3, git_workflow]
---

## Goal

本番バグを再現可能なテストで捕捉し、根本原因を修正して PR をマージする。
修正後に同じバグが再発しない状態を保証する。

## Workflow

```
Step 1  [analysis] ※本番データ確認が必要な場合
  └── Athena でデータ品質チェック
      CloudWatch Logs でエラーログ確認
      原因仮説の立案

Step 2  [project_management]
  └── gh issue create（バグ内容・再現手順・影響範囲）
      git switch -c fix/<番号>-<bug-name>

Step 3  [testing]
  └── 再現テスト作成（Red 確認）
      - Lambda: pytest で再現ケースを追加
      - Frontend: tsc エラーで型問題を表現

Step 4  [lambda / frontend / devops] ← 原因に応じて選択
  └── 修正実装（Green 確認）
      pytest / tsc → 再現テストが PASSED

Step 5  [testing]
  ├── pytest lambda/ -v → 全件 PASSED
  ├── npx tsc --noEmit → エラーなし
  └── npm run build → 成功

Step 6  [project_management]
  └── git add <files> → git commit（fix: <内容>）
      gh pr create → CI 確認 → squash merge
```

## 原因別対応マトリクス

| 症状 | 確認先 | 担当エージェント |
|------|--------|----------------|
| Lambda 500 エラー | CloudWatch Logs / pytest | lambda |
| Athena COLUMN_NOT_FOUND | Iceberg メタデータ vs Glue 定義 | data_engineering |
| 型エラー（フロント） | tsc エラーログ | frontend |
| Terraform plan エラー | terraform validate | devops |
| CI 失敗 | gh run view --log-failed | devops |
| 認証エラー | Cognito / JWT claims | lambda |

## 過去の既知バグ（参考）

```
PR #16: get_latest が COLUMN_NOT_FOUND で全件 500 エラー
  原因: Glue にカラム追加したが Iceberg メタデータが未同期
  修正: Athena DDL（ALTER TABLE ADD COLUMNS）を実行
  → スキーマ変更後は必ず Athena DDL も実行すること
```

## Checklist

```
調査
  [ ] エラーログ・Athena データで原因特定済み
  [ ] 影響範囲（ユーザー数・期間）確認済み

修正
  [ ] 再現テスト作成（Red → Green）
  [ ] 修正実装完了
  [ ] 回帰防止テスト追加

確認
  [ ] pytest lambda/ -v → 全件 PASSED
  [ ] npx tsc --noEmit → エラーなし
  [ ] npm run build → 成功
  [ ] PR マージ済み・Issue クローズ済み
```

## Expected Output

- 再現テストを含む修正 PR（マージ済み）
- バグの根本原因と修正内容の説明
- 同じバグが再発しない回帰テスト
