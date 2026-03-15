-- models/staging/stg_env__hourly.sql
-- 責務: 型変換・NULL処理・カラム名標準化のみ。ビジネスロジックは書かない。

with source as (
    select * from {{ source('raw_env', 'ext_environment_raw') }}
),

renamed as (
    select
        -- 時刻
        {{ safe_cast('observation_datetime_jst', 'timestamp') }}  as observation_datetime_jst,
        {{ safe_cast('observation_date', 'date') }}               as observation_date,
        {{ safe_cast('observation_hour', 'int') }}                as observation_hour,

        -- 場所
        {{ safe_cast('location_id', 'varchar') }}                 as location_id,
        {{ safe_cast('latitude', 'double') }}                     as latitude,
        {{ safe_cast('longitude', 'double') }}                    as longitude,
        {{ safe_cast('source_name', 'varchar') }}                 as source_name,

        -- 気温・気圧・湿度（必須）
        {{ safe_cast('temperature_c', 'double') }}                as temperature_c,
        {{ safe_cast('apparent_temperature_c', 'double') }}       as apparent_temperature_c,
        {{ safe_cast('pressure_hpa', 'double') }}                 as pressure_hpa,
        {{ safe_cast('humidity_pct', 'double') }}                 as humidity_pct,

        -- 天気・降水
        {{ safe_cast('weather_code', 'int') }}                    as weather_code,
        coalesce({{ safe_cast('precipitation_mm', 'double') }}, 0.0) as precipitation_mm,
        {{ safe_cast('wind_speed_mps', 'double') }}               as wind_speed_mps,
        {{ safe_cast('uv_index', 'double') }}                     as uv_index,

        -- 大気質・花粉（任意）
        {{ safe_cast('aqi', 'double') }}                          as aqi,
        {{ safe_cast('pm25', 'double') }}                         as pm25,
        {{ safe_cast('birch_pollen', 'double') }}                 as birch_pollen,
        {{ safe_cast('grass_pollen', 'double') }}                 as grass_pollen,
        {{ safe_cast('weed_pollen', 'double') }}                  as weed_pollen,

        -- メタデータ
        {{ safe_cast('raw_ingested_at', 'timestamp') }}           as raw_ingested_at,
        {{ safe_cast('request_id', 'varchar') }}                  as request_id,
        {{ safe_cast('record_created_at', 'timestamp') }}         as record_created_at

    from source
    where observation_datetime_jst is not null
      and location_id is not null
      and temperature_c is not null
      and pressure_hpa is not null
      and humidity_pct is not null
)

select * from renamed
