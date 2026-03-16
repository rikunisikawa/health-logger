---
paths:
  - "lambda/**/*.py"
---
# Python Lambda セキュリティルール

## user_id の必須バリデーション

Athena クエリに `user_id` を埋め込む前に **必ず** UUID 正規表現で検証する。

```python
import re

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)

def validate_user_id(user_id: str) -> bool:
    return bool(UUID_RE.match(user_id))

# handler.py での使用例
if not validate_user_id(user_id):
    return _json(400, {"error": "invalid user_id"})
```

## Athena クエリのインジェクション防止

- f-string への直接埋め込みは UUID 検証済みの値のみ許可
- ユーザー入力文字列を WHERE 句に直接埋め込まない
- テーブル名・カラム名はハードコードする（動的生成禁止）

```python
# OK: UUID 検証済みの user_id のみ
query = f"SELECT * FROM health_records WHERE user_id = '{user_id}' LIMIT 1"

# NG: 未検証の文字列を直接埋め込む
query = f"SELECT * FROM health_records WHERE {user_input}"
```

## boto3 クライアントの初期化

モジュールレベルで初期化する（Lambda のウォームスタートでセッションを再利用）。

```python
# OK: モジュールレベル
import boto3
firehose = boto3.client("firehose", region_name="ap-northeast-1")
athena = boto3.client("athena", region_name="ap-northeast-1")

def handler(event, context):
    # firehose / athena を直接使う

# NG: 関数内で毎回初期化
def handler(event, context):
    firehose = boto3.client("firehose")  # コールドスタート時のみ有効
```

## エラーレスポンス

内部スタックトレースをレスポンスに含めない。

```python
def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }

# OK
return _json(500, {"error": "internal server error"})

# NG: スタックトレースを返す
return _json(500, {"error": str(e), "traceback": traceback.format_exc()})
```

## シークレット管理

- VAPID 秘密鍵・API キーは SSM Parameter Store または Secrets Manager から取得
- `os.environ` 経由で環境変数として Lambda に渡す
- コードへの直接書き込み禁止
