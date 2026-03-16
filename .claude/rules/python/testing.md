---
paths:
  - "lambda/**/*.py"
---
# Python Lambda テストルール

## テストファイルの構成

```
lambda/<fn>/
  handler.py        # 実装
  models.py         # Pydantic v2 モデル
  test_handler.py   # pytest テスト（同ディレクトリ）
  requirements.txt  # 本番依存
```

## pytest の基本パターン

```python
import json
import pytest
from unittest.mock import patch, MagicMock

# conftest.py または test ファイル内で fixture 定義
@pytest.fixture
def valid_event():
    return {
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "test-user-id-1234-5678-abcd"}}}},
        "body": json.dumps({
            "fatigue": 3,
            "mood": 4,
            "motivation": 2,
            "flags": 0,
        }),
    }

@patch("handler.firehose")
def test_create_record_success(mock_fh, valid_event):
    mock_fh.put_record.return_value = {"RecordId": "xxx"}
    from handler import handler
    response = handler(valid_event, {})
    assert response["statusCode"] == 201

def test_invalid_user_id():
    event = {
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "not-a-uuid"}}}},
        "body": json.dumps({"fatigue": 3, "mood": 4, "motivation": 2, "flags": 0}),
    }
    from handler import handler
    response = handler(event, {})
    assert response["statusCode"] == 400
```

## Pydantic v2 モデルのテスト

```python
import pytest
from pydantic import ValidationError
from models import HealthRecordInput

def test_valid_input():
    data = HealthRecordInput(fatigue=3, mood=4, motivation=2, flags=0)
    assert data.fatigue == 3

def test_out_of_range():
    with pytest.raises(ValidationError):
        HealthRecordInput(fatigue=6, mood=4, motivation=2, flags=0)  # max=5
```

## テスト実行

```bash
# 個別 Lambda のテスト
pytest lambda/create_record/ -v

# 全 Lambda のテスト（PR 前に必ず実行）
pytest lambda/ -v
```

## カバレッジ目標

- 正常系・バリデーションエラー・AWS エラーの 3 パターンを最低限カバーする
- AWS サービス（Firehose・Athena）は `unittest.mock.patch` でモック化する
