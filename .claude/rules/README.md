# .claude/rules/

パスフィルター付きのルールファイル。対象ファイルを変更する際に Claude Code が自動的に参照する。

## 構成

```
rules/
  python/
    security.md    — user_id UUID 検証・SQL インジェクション防止・boto3 初期化・シークレット管理
    testing.md     — pytest パターン・Pydantic v2 テスト・カバレッジ目標
  typescript/
    security.md    — strict モード維持・環境変数参照・Amplify Auth・XSS 防止
  terraform/
    workflow.md    — apply 前確認フロー・sensitive 変数・CORS 設定・Iceberg DDL
```

## ルールの優先順位

1. CLAUDE.md の禁止事項（最優先）
2. .claude/rules/ のルールファイル（パスマッチ時に適用）
3. スキル（明示的に呼び出した場合）
