# Lambda 開発ガイド

> 対象読者: 開発者
> Python Lambda 関数の実装パターン・テスト方法・追加手順を記載する。

---

## Lambda 関数の構成

各 Lambda は `lambda/<function_name>/` ディレクトリに格納する。

```
lambda/
  create_record/
    __init__.py          # パッケージ初期化（空でよい）
    handler.py           # Lambda ハンドラー関数
    models.py            # Pydantic v2 モデル定義（handler.py に書かない）
    requirements.txt     # 本番依存パッケージ
    conftest.py          # pytest フィクスチャ
    test_handler.py      # pytest テスト
  get_latest/
    __init__.py
    handler.py
    requirements.txt
    conftest.py
    test_handler.py
  ...
```

**基本原則**:
- `handler.py` にはリクエスト処理のロジックのみ書く
- 型定義・バリデーションは `models.py` に分離する
- テストは同ディレクトリの `test_handler.py` に書く

---

## handler.py の実装パターン

### 標準的なハンドラーの構造

```python
import json
import os
import re

import boto3
from pydantic import ValidationError

from models import MyInput

# boto3 クライアントはモジュールレベルで初期化（Lambda のウォームスタートで再利用される）
firehose = boto3.client("firehose")
STREAM_NAME = os.environ["FIREHOSE_STREAM_NAME"]

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


def lambda_handler(event, context):
    # 1. 認証: Cognito sub を取り出す
    try:
        user_id = event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        return _json(401, {"error": "Unauthorized"})

    # 2. user_id のバリデーション（SQL インジェクション防止）
    if not _UUID_RE.match(user_id):
        return _json(401, {"error": "Invalid user ID"})

    # 3. リクエストボディのパース
    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return _json(400, {"error": "Invalid JSON"})

    # 4. Pydantic バリデーション
    try:
        data = MyInput(**body)
    except ValidationError as e:
        return _json(400, {"error": "Validation failed", "details": e.errors()})

    # 5. ビジネスロジック
    ...

    return _json(200, {"message": "OK"})


def _json(status: int, body: dict) -> dict:
    """エラーレスポンスの統一ヘルパー。内部スタックトレースは含めない。"""
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }
```

### 重要なルール

**boto3 クライアントはモジュールレベルで初期化する**

```python
# OK: ウォームスタート時にセッションを再利用できる
firehose = boto3.client("firehose")

def lambda_handler(event, context):
    firehose.put_record(...)  # モジュール変数を使う

# NG: 毎回コールドスタートと同じコストになる
def lambda_handler(event, context):
    firehose = boto3.client("firehose")  # 関数内で初期化しない
```

**user_id は必ず UUID 正規表現で検証する**

Athena クエリに `user_id` を f-string で埋め込むため、SQL インジェクション防止のために必須:

```python
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)

if not _UUID_RE.match(user_id):
    return _json(401, {"error": "Invalid user ID"})

# UUID 検証済みのため f-string に埋め込んでよい
query = f"SELECT * FROM health_records WHERE user_id = '{user_id}'"
```

---

## models.py の定義パターン

Pydantic v2 を使用する。バリデーションロジックは `models.py` に集約する。

```python
from typing import Literal, Optional, Union
from pydantic import BaseModel, Field


class CustomFieldValue(BaseModel):
    item_id: str
    label:   str
    type:    Literal["slider", "checkbox", "number", "text"]
    value:   Union[int, float, bool, str]


class HealthRecordInput(BaseModel):
    # 必須フィールド
    recorded_at: str = Field(...)

    # オプション（デフォルト値付き）
    record_type:      Literal["daily", "event", "status"] = Field("daily")
    fatigue_score:    Optional[int] = Field(None, ge=0, le=100)
    mood_score:       Optional[int] = Field(None, ge=0, le=100)
    motivation_score: Optional[int] = Field(None, ge=0, le=100)
    flags:            int  = Field(0,  ge=0, le=63)
    note:             str  = Field("", max_length=280)
    timezone:         str  = Field("UTC")
    device_id:        str  = Field("")
    app_version:      str  = Field("1.0.0")
    custom_fields:    list[CustomFieldValue] = Field(default_factory=list)
```

`Field(...)` は必須フィールドを示す（`...` は Pydantic の「必須」記法）。

---

## 環境変数の管理

Lambda の環境変数は `os.environ` で参照する。Terraform の `modules/lambda/` で定義する。

```python
import os

# 必須の環境変数（存在しなければ起動時にクラッシュする → 意図的な早期失敗）
STREAM_NAME   = os.environ["FIREHOSE_STREAM_NAME"]
DATABASE      = os.environ["ATHENA_DATABASE"]
OUTPUT_BUCKET = os.environ["ATHENA_OUTPUT_BUCKET"]

# 任意の環境変数（デフォルト値付き）
TABLE = os.environ.get("ATHENA_TABLE", "health_records")
```

**テスト時の環境変数設定**は `conftest.py` で行う:

```python
import os
import pytest

@pytest.fixture(autouse=True)
def env_vars(monkeypatch):
    monkeypatch.setenv("FIREHOSE_STREAM_NAME", "test-stream")
    monkeypatch.setenv("ATHENA_DATABASE", "test_db")
    monkeypatch.setenv("ATHENA_OUTPUT_BUCKET", "test-bucket")
```

---

## requirements.txt の構成

本番で必要な依存パッケージのみ記載する（テスト用パッケージは含めない）。

```
# create_record/requirements.txt
pydantic>=2.0,<3

# get_latest/requirements.txt
boto3  # Lambda 実行環境に含まれているが明示すると管理しやすい

# push_notify/requirements.txt
pywebpush>=2.0,<3
```

> AWS Lambda の Python 3.13 ランタイムには `boto3` が標準で含まれる。
> ただし、バージョン固定が必要な場合は `requirements.txt` に記載する。

---

## ローカルテスト

### pytest の実行

```bash
# 全 Lambda のテスト
pytest lambda/ -v

# 個別 Lambda のテスト
pytest lambda/create_record/ -v
pytest lambda/get_latest/ -v
```

### テストの書き方

AWS サービス（Firehose・Athena・DynamoDB）は `unittest.mock.patch` でモック化する。

```python
import json
import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture
def valid_event():
    return {
        "requestContext": {
            "authorizer": {
                "jwt": {
                    "claims": {"sub": "12345678-1234-1234-1234-123456789012"}
                }
            }
        },
        "body": json.dumps({
            "fatigue_score": 60,
            "mood_score": 70,
            "motivation_score": 50,
            "flags": 0,
            "recorded_at": "2026-03-16T08:00:00+09:00",
        }),
    }


@patch("handler.firehose")
def test_create_record_success(mock_fh, valid_event):
    mock_fh.put_record.return_value = {"RecordId": "xxx"}
    from handler import lambda_handler
    response = lambda_handler(valid_event, {})
    assert response["statusCode"] == 201
    body = json.loads(response["body"])
    assert "record_id" in body


def test_missing_auth():
    """認証情報がない場合は 401 を返す"""
    event = {"body": json.dumps({"recorded_at": "2026-03-16T08:00:00+09:00"})}
    from handler import lambda_handler
    response = lambda_handler(event, {})
    assert response["statusCode"] == 401


def test_validation_error(valid_event):
    """バリデーションエラー（範囲外の値）は 400 を返す"""
    import json
    body = json.loads(valid_event["body"])
    body["fatigue_score"] = 999  # 100 を超える
    valid_event["body"] = json.dumps(body)
    from handler import lambda_handler
    response = lambda_handler(valid_event, {})
    assert response["statusCode"] == 400
```

**カバレッジ目標**: 正常系・バリデーションエラー・AWS エラー（モック）の 3 パターンを最低限カバーする。

---

## 新規 Lambda 関数の追加手順

### 1. Lambda ディレクトリの作成

```bash
mkdir -p lambda/my_new_function
touch lambda/my_new_function/__init__.py
touch lambda/my_new_function/handler.py
touch lambda/my_new_function/requirements.txt
touch lambda/my_new_function/test_handler.py
```

### 2. handler.py と requirements.txt の実装

上記の「handler.py の実装パターン」を参考に実装する。

### 3. terraform/modules/lambda/ の更新

`terraform/modules/lambda/main.tf` に新しい Lambda リソースを追加する。

```hcl
resource "aws_lambda_function" "my_new_function" {
  function_name = "${var.project}-${var.env}-my-new-function"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "python3.13"
  handler       = "handler.lambda_handler"
  s3_bucket     = aws_s3_bucket.artifacts.bucket
  s3_key        = var.lambda_s3_keys["my_new_function"]
  timeout       = 30
  environment {
    variables = {
      # 必要な環境変数を定義
    }
  }
}
```

`variables.tf` の `lambda_s3_keys` に新しいキーを追加する。

### 4. terraform/modules/apigw/ の更新

API Gateway に新しいルートを追加する（HTTP API の場合）:

```hcl
resource "aws_apigatewayv2_integration" "my_new_function" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.my_new_function_lambda_invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "my_new_function" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /my-endpoint"
  target             = "integrations/${aws_apigatewayv2_integration.my_new_function.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}
```

### 5. deploy.yml の更新

`.github/workflows/deploy.yml` の「Build Lambda ZIPs」ジョブに新しい関数のパッケージ手順を追加する:

```yaml
- name: Package my_new_function Lambda
  run: |
    cd lambda/my_new_function
    pip install -r requirements.txt -t . --quiet
    zip -r ../../my_new_function.zip . -x "test_*" "*.pyc" "__pycache__/*"
```

また、アップロードと outputs にも追加する。

### 6. terraform/envs/prod/main.tf の更新

`module "apigw"` ブロックに新しい Lambda の invoke_arn と function_name を渡す。
