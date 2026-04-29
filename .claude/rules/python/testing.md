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

## Athena クエリを生成する Lambda の必須ルール

### SQL 文字列を必ずアサートする

モックされた Athena はどんな SQL を渡しても `SUCCEEDED` を返す。
ステータスコードだけをアサートしても SQL の正しさは検証できない。
**新しいフィルタ条件・カラム参照を追加したら、生成される SQL 文字列を必ず検証すること。**

```python
@patch("handler.athena")
def test_date_from_filter(mock_athena):
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "SUCCEEDED"}}
    }
    mock_athena.get_query_results.return_value = {
        "ResultSet": {"Rows": [{"Data": [{"VarCharValue": "id"}]}]}
    }

    import handler
    result = handler.lambda_handler(_auth_event_params(date_from="2024-01-01"), None)
    assert result["statusCode"] == 200

    # ✅ 生成された SQL を取り出して検証する
    qs = mock_athena.start_query_execution.call_args[1]["QueryString"]
    assert "DATE(recorded_at) >= DATE '2024-01-01'" in qs  # 正しい式が使われているか
    assert "dt >=" not in qs                                # 誤った式が残っていないか
```

### スキーマを事前に確認してからテストを書く

Athena クエリで使えるカラムは **Glue カタログのスキーマ定義**に従う。
実装前に `docs/DATABASE_SCHEMA.md` を参照し、使用するカラム名・型・式が正しいことを確認する。

| よくある誤り | 正しい書き方 | 理由 |
|-------------|-------------|------|
| `dt >= '2024-01-01'` | `DATE(recorded_at) >= DATE '2024-01-01'` | `dt` はパーティションキーで Iceberg では直接クエリ不可 |
| `WHERE dt = '2024-01-01'` | `WHERE DATE(recorded_at) = DATE '2024-01-01'` | 同上 |

### TDD の手順（Athena クエリ編）

```
① スキーマ確認（docs/DATABASE_SCHEMA.md）
      ↓
② 正しい SQL 式を決める（例: DATE(recorded_at) >= DATE '...'）
      ↓
③ その式を assert するテストを書く → pytest 実行 → RED（FAILED）を確認
      ↓
④ テストが通る実装を書く
      ↓
⑤ pytest 実行 → GREEN（PASSED）を確認
```

**③ のテストが RED にならない場合（実装前なのに PASSED になる）は、テストが実装の写しになっている疑いがある。テストを見直すこと。**
