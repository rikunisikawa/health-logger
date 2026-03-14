---
playbook: implement_feature
goal: 新機能を Issue 作成からPR マージまで完走する標準フロー
agents_used: [orchestrator, project_management, architecture, frontend, lambda, data_engineering, devops, testing, documentation]
skills_used: [git_workflow, python_lambda, typescript_react, data_pipeline, ci_cd]
---

## Goal

新しい機能を品質を担保しながら、Issue 作成 → 実装 → テスト → PR → マージまで完走する。

## Workflow

```
Step 1  [project_management]
  └── gh issue create
      ブランチ作成: git switch -c feature/<issue番号>-<名前>

Step 2  [architecture] ※複雑な変更の場合のみ
  └── 設計レビュー
      - データフロー・API インターフェース設計
      - 影響範囲（Lambda / フロント / Terraform）の特定

Step 3  [testing]
  └── テスト設計
      - pytest テストを先に書く（Red 確認）
      - TypeScript 型エラーで Red 状態を作る

Step 4  [実装] ※並列実行可能
  ├── [frontend]        フロントエンド変更
  ├── [lambda]          Lambda 変更
  └── [data_engineering] スキーマ・パイプライン変更

Step 5  [devops] ※インフラ変更が伴う場合
  └── terraform plan → ユーザー確認 → apply

Step 6  [testing]
  ├── pytest lambda/ -v → 全件 PASSED
  ├── npx tsc --noEmit → エラーなし
  └── npm run build → 成功

Step 7  [documentation] ※API 仕様・CLAUDE.md に変更がある場合
  └── ドキュメント更新

Step 8  [project_management]
  └── git add <files> → git commit → git push
      gh pr create（テスト確認チェックリスト付き）
      gh pr checks → CI 通過確認
      gh pr merge --squash --delete-branch
```

## 並列実行

Step 4 の実装フェーズは依存関係がなければ並列実行可能:

```
[frontend] と [lambda] は独立して並列実装できる
[data_engineering] はスキーマ確定後に実行（architecture の後）
```

## Agents Used

| Step | Agent | Skill |
|------|-------|-------|
| 1, 8 | project_management | git_workflow |
| 2 | architecture | - |
| 3, 6 | testing | python_lambda, typescript_react |
| 4a | frontend | typescript_react |
| 4b | lambda | python_lambda, aws_boto3 |
| 4c | data_engineering | data_pipeline |
| 5 | devops | terraform_iac, ci_cd |
| 7 | documentation | - |

## Expected Output

- GitHub Issue（番号・URL）
- 実装された機能（動作確認済み）
- pytest: 全件 PASSED
- tsc: エラーなし
- build: 成功
- マージ済み PR（URL）
- クローズ済み Issue
