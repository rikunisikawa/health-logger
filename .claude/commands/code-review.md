---
description: 変更差分のセキュリティ・品質レビュー。UUID 検証・シークレット漏洩・SQL インジェクションを重点確認。
---

# /code-review — セキュリティ重視コードレビュー

## 実行手順

```bash
# レビュー対象の差分を確認
git diff HEAD
git diff --name-only HEAD
```

## CRITICAL チェック（必須：ブロック対象）

### シークレット漏洩
- [ ] VAPID 秘密鍵・PAT・API キーがコードに含まれていないか
- [ ] `terraform.tfvars` にシークレット値が直接書かれていないか
- [ ] PR 説明文にシークレット値が含まれていないか

### SQL インジェクション（Athena）
- [ ] `user_id` を Athena クエリに埋め込む前に UUID 正規表現で検証しているか

  ```python
  # 必須パターン
  import re
  UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
  if not UUID_RE.match(user_id):
      return _json(400, {"error": "invalid user_id"})
  ```

### Terraform セキュリティ
- [ ] `sensitive = true` が付いているか（VAPID 鍵・GitHub PAT などの変数）
- [ ] `cors_allow_origins = ["*"]` のまま本番に出ていないか

## HIGH チェック（修正推奨）

### Python Lambda
- [ ] Pydantic v2 バリデーションが `models.py` に分離されているか（`handler.py` に書いていないか）
- [ ] boto3 クライアントがモジュールレベルで初期化されているか（関数内は NG）
- [ ] エラーレスポンスに内部スタックトレースを含めていないか

### TypeScript
- [ ] `tsconfig.json` の `strict: true` を緩めていないか
- [ ] 環境変数を `import.meta.env.VITE_*` 経由で参照しているか
- [ ] IndexedDB を `useOfflineQueue` フック外で直接触っていないか

## MEDIUM チェック（確認推奨）

- [ ] 新しい Lambda 関数にテストが書かれているか
- [ ] Iceberg スキーマ変更時に `ALTER TABLE` DDL の実行計画があるか
- [ ] FLAGS ビットマスク変更時に Lambda・Frontend・dbt 全レイヤーを更新しているか

## レポート形式

```
[CRITICAL] シークレット漏洩 — lambda/push_notify/handler.py:42 に VAPID 鍵が直書き
[HIGH]     Pydantic バリデーション — handler.py に直接書かれている（models.py に移動）
[MEDIUM]   テスト不足 — 新規追加の get_trends 関数にテストがない
```
