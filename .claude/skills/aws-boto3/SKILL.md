---
name: aws-boto3
description: AWS SDK boto3 の操作パターン集。Lambda 関数から Firehose・Athena・SSM を呼び出す実装をするとき、boto3 クライアント初期化・Athena ポーリング・エラーハンドリングが必要なときに自動適用する。
user-invocable: false
---

## Purpose

Lambda 関数から Firehose・Athena・DynamoDB・SSM などの AWS サービスを
boto3 で安全・効率的に操作するための共通パターン集。

## Responsibilities

- boto3 クライアント初期化パターン
- Firehose へのレコード送信
- Athena クエリの実行とポーリング
- SSM Parameter Store からのシークレット取得
- エラーハンドリング

## Patterns

### クライアント初期化（モジュールレベル）

```python
import boto3
import os

# Lambda コンテナ再利用のため、関数外で初期化する
firehose = boto3.client("firehose", region_name="ap-northeast-1")
athena   = boto3.client("athena",   region_name="ap-northeast-1")
ssm      = boto3.client("ssm",      region_name="ap-northeast-1")

STREAM_NAME = os.environ["FIREHOSE_STREAM_NAME"]
DATABASE    = os.environ["ATHENA_DATABASE"]
S3_OUTPUT   = os.environ["ATHENA_OUTPUT_LOCATION"]
```

### Firehose へのレコード送信

```python
import json

def put_record(data: dict) -> None:
    record = json.dumps(data, ensure_ascii=False) + "\n"  # JSON Lines
    firehose.put_record(
        DeliveryStreamName=STREAM_NAME,
        Record={"Data": record.encode("utf-8")},
    )
```

### Athena クエリ実行とポーリング（最大 10 秒）

```python
import time

def run_athena_query(sql: str) -> list[dict]:
    res = athena.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": DATABASE},
        ResultConfiguration={"OutputLocation": S3_OUTPUT},
    )
    execution_id = res["QueryExecutionId"]

    for _ in range(20):           # 0.5s × 20 = 最大 10 秒
        time.sleep(0.5)
        state = athena.get_query_execution(
            QueryExecutionId=execution_id
        )["QueryExecution"]["Status"]["State"]

        if state == "SUCCEEDED":
            break
        if state in ("FAILED", "CANCELLED"):
            raise RuntimeError(f"Athena query {state}: {execution_id}")

    rows = athena.get_query_results(
        QueryExecutionId=execution_id
    )["ResultSet"]["Rows"]

    headers = [c["VarCharValue"] for c in rows[0]["Data"]]
    return [
        {headers[i]: col.get("VarCharValue", "") for i, col in enumerate(row["Data"])}
        for row in rows[1:]
    ]
```

### SSM からシークレット取得

```python
def get_secret(name: str) -> str:
    return ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]
```

### エラーレスポンスヘルパー

```python
import json

def _json(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }
```

## Best Practices

- boto3 クライアントは必ずモジュールレベルで初期化する（関数内は NG）
- Firehose の JSON Lines は必ず末尾に `\n` を付ける
- Athena ポーリングは最大 10 秒でタイムアウト設計
- 環境変数は `os.environ["KEY"]` で参照（`.get()` で隠蔽しない）
- `ClientError` を適切にキャッチしてユーザー向けエラーメッセージを返す
