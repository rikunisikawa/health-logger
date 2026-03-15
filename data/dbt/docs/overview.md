# Health Logger データカタログ

## 概要

毎日の体調（疲労感・気分・やる気）と環境データ（気象・花粉・大気質）を統合した分析基盤。

## データフロー

```
Open-Meteo API → Lambda → Firehose → S3 Tables (Iceberg) → Glue
                                                                ↓
                                                              dbt（このプロジェクト）
                                                                ↓
                                                            Athena（分析クエリ）
```

## レイヤー説明

| レイヤー | 色 | 説明 |
|---|---|---|
| staging | グレー | 生データの型変換・正規化のみ。ビジネスロジックなし |
| intermediate | オレンジ | 再利用可能なビジネスロジック・集約 |
| marts | ティール | 最終的な分析・アプリ用テーブル（table/incremental） |

## 主要テーブル

- `fct_health_env_joined_hourly`: 分析のメインテーブル。体調記録 x 環境データの結合
- `fct_environment_hourly`: 時間粒度の環境ファクトテーブル（incremental）
- `fct_environment_daily`: 日次集約の環境ファクトテーブル（incremental）
- `int_health__daily_scores`: ユーザー x 日次の体調スコア集約 + FLAGSデコード

## FLAGS ビットマスク

| bit | 値 | 意味 |
|---|---|---|
| 0 | 1 | 睡眠不足 (poor_sleep) |
| 1 | 2 | 頭痛 (headache) |
| 2 | 4 | 腹痛 (stomachache) |
| 3 | 8 | 運動 (exercise) |
| 4 | 16 | アルコール (alcohol) |
| 5 | 32 | カフェイン (caffeine) |

## よく使うコマンド

```bash
dbt source freshness          # source の鮮度チェック
dbt build                     # 全モデル run + test
dbt run --select staging.*    # staging のみ
dbt run --select +fct_health_env_joined_hourly  # 依存ツリーごと
dbt test --select staging.*   # staging テストのみ
dbt docs generate && dbt docs serve  # ドキュメント確認
dbt run --full-refresh --select fct_environment_hourly  # フルリビルド
```
