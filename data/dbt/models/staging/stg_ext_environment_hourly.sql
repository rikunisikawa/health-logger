-- staging/stg_ext_environment_hourly.sql
-- S3 raw レイヤーを正規化するモデル
-- カラム名標準化・型変換・NULL処理

with source as (
    select * from {{ source('raw_env', 'ext_environment_raw') }}
),

renamed as (
    select
        -- 時刻
        cast(observation_datetime_jst as timestamp) as observation_datetime_jst,
        cast(observation_date          as date)      as observation_date,
        cast(observation_hour          as int)       as observation_hour,

        -- 場所
        cast(location_id               as varchar)   as location_id,
        cast(latitude                  as double)    as latitude,
        cast(longitude                 as double)    as longitude,
        cast(source_name               as varchar)   as source_name,

        -- 気温・気圧・湿度（必須）
        cast(temperature_c             as double)    as temperature_c,
        cast(apparent_temperature_c    as double)    as apparent_temperature_c,
        cast(pressure_hpa              as double)    as pressure_hpa,
        cast(humidity_pct              as double)    as humidity_pct,

        -- 天気・降水
        cast(weather_code              as int)       as weather_code,
        coalesce(cast(precipitation_mm as double), 0.0) as precipitation_mm,
        cast(wind_speed_mps            as double)    as wind_speed_mps,
        cast(uv_index                  as double)    as uv_index,

        -- 大気質・花粉（任意）
        cast(aqi                       as double)    as aqi,
        cast(pm25                      as double)    as pm25,
        cast(birch_pollen              as double)    as birch_pollen,
        cast(grass_pollen              as double)    as grass_pollen,
        cast(weed_pollen               as double)    as weed_pollen,

        -- メタデータ
        cast(raw_ingested_at           as timestamp) as raw_ingested_at,
        cast(request_id                as varchar)   as request_id,
        cast(record_created_at         as timestamp) as record_created_at

    from source
    where
        observation_datetime_jst is not null
        and location_id is not null
        and temperature_c is not null
        and pressure_hpa is not null
        and humidity_pct is not null
)

select * from renamed
