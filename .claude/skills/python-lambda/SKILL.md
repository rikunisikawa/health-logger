---
name: python-lambda
description: Python 3.13 + Pydantic v2 による Lambda 関数の実装パターン集。handler.py の構造、Pydantic モデル定義、pytest テストの書き方を含む。Lambda 関数を新規実装・修正・テストするときに自動適用する。
user-invocable: false
---

## Purpose

health-logger の Lambda 関数を Pydantic v2 で型安全に実装し、
pytest で品質を保証するためのパターン集。

## Responsibilities

- ハンドラー構造の標準化
- Pydantic v2 バリデーション
- UUID・入力値の安全な検証
- pytest ユニットテストパターン
- エラーレスポンスの統一

## Patterns

### ハンドラー基本構造

```python
import json
import re
import boto3
from models import HealthRecord  # Pydantic モデルは分離

# boto3 クライアントはモジュールレベルで初期化
firehose = boto3.client("firehose")

def handler(event: dict, context) -> dict:
    # 1. 認証情報取得
    user_id = event.get("requestContext", {}) \
                   .get("authorizer", {}) \
                   .get("jwt", {}) \
                   .get("claims", {}) \
                   .get("sub")
    if not user_id:
        return _json(401, {"error": "Unauthorized"})

    # 2. UUID 検証（SQL インジェクション防止）
    if not re.fullmatch(r"[0-9a-f-]{36}", user_id):
        return _json(400, {"error": "Invalid user_id"})

    # 3. ボディパース + Pydantic バリデーション
    try:
        body = json.loads(event.get("body") or "{}")
        record = HealthRecord(**body, user_id=user_id)
    except Exception as e:
        return _json(422, {"error": str(e)})

    # 4. ビジネスロジック
    # ...

    return _json(200, {"message": "OK"})


def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }
```

### Pydantic v2 モデル（models.py）

```python
from pydantic import BaseModel, field_validator
from datetime import datetime, timezone

class HealthRecord(BaseModel):
    user_id:    str
    fatigue:    int
    mood:       int
    motivation: int
    flags:      int = 0

    @field_validator("fatigue", "mood", "motivation")
    @classmethod
    def validate_score(cls, v: int) -> int:
        if not 0 <= v <= 10:
            raise ValueError("Score must be 0-10")
        return v

    @field_validator("flags")
    @classmethod
    def validate_flags(cls, v: int) -> int:
        if not 0 <= v <= 63:
            raise ValueError("Flags must be 0-63")
        return v
```

### pytest テストパターン

```python
import pytest
from unittest.mock import patch, MagicMock

BASE_EVENT = {
    "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "a" * 8 + "-" + "b" * 4 + "-" + "c" * 4 + "-" + "d" * 4 + "-" + "e" * 12}}}},
    "body": json.dumps({"fatigue": 5, "mood": 7, "motivation": 6, "flags": 0}),
}

@patch("handler.firehose")
def test_success(mock_fh):
    mock_fh.put_record.return_value = {}
    res = handler(BASE_EVENT, None)
    assert res["statusCode"] == 200

@patch("handler.firehose")
def test_invalid_score(mock_fh):
    event = {**BASE_EVENT, "body": json.dumps({"fatigue": 11, "mood": 5, "motivation": 5})}
    res = handler(event, None)
    assert res["statusCode"] == 422

def test_no_auth():
    res = handler({"requestContext": {}, "body": "{}"}, None)
    assert res["statusCode"] == 401
```

## Best Practices

- Pydantic v2 API を使う（`@validator` → `@field_validator`, `@classmethod` 必須）
- SQL / AWS に渡す user_id は必ず UUID 正規表現で検証
- `models.py` に型定義を分離（`handler.py` に書かない）
- boto3 クライアントはモジュールレベルで初期化
- テストは正常系・異常系・境界値をカバーする

## Output Format

- `handler.py`: ハンドラー関数のみ（クライアント初期化・ヘルパー含む）
- `models.py`: Pydantic モデルのみ
- `test_handler.py`: pytest テスト
- `requirements.txt`: 最小限の依存関係
