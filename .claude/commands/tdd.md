---
description: Lambda 関数のテスト駆動開発ワークフロー。test_handler.py を先に書いてから handler.py を実装する。
---

# /tdd — TDD ワークフロー（Lambda）

## サイクル: RED → GREEN → REFACTOR

### RED: 失敗テストを書く

```bash
# テスト実行して失敗を確認
pytest lambda/<fn>/test_handler.py -v
```

テストで確認すること:
- 正常系（期待するレスポンスのステータスコード・ボディ）
- バリデーションエラー（不正な user_id・範囲外の値）
- AWS サービスエラー（Firehose 失敗・Athena タイムアウト）

### GREEN: 最小実装でテストを通す

```bash
pytest lambda/<fn>/test_handler.py -v
# 全件 PASSED になるまで実装を続ける
```

実装チェックリスト（`handler.py`）:
- [ ] `user_id` を UUID 正規表現で検証（SQLインジェクション防止）
- [ ] Pydantic v2 モデルで入力バリデーション（`models.py` に分離）
- [ ] boto3 クライアントをモジュールレベルで初期化
- [ ] エラーレスポンスは `_json(status, body)` ヘルパーで統一

### REFACTOR: リファクタしてスイートを通す

```bash
# Lambda 全体のテストスイートを通す
pytest lambda/ -v
```

確認項目:
- [ ] 重複コードを排除
- [ ] 関数が単一責任か
- [ ] 型アノテーションが付いているか（`models.py`）

## Lambda テストのパターン

```python
# Firehose モック
@patch("handler.firehose")
def test_create_record_success(mock_fh, valid_event):
    mock_fh.put_record.return_value = {"RecordId": "xxx"}
    response = handler(valid_event, {})
    assert response["statusCode"] == 201

# バリデーションエラー
def test_invalid_user_id(invalid_user_id_event):
    response = handler(invalid_user_id_event, {})
    assert response["statusCode"] == 400
```
