{% macro pressure_lag_feature(column, hours, partition_col='location_id', order_col='observation_datetime_jst') %}
  {{ column }} - lag({{ column }}, {{ hours }}) over (
      partition by {{ partition_col }}
      order by {{ order_col }}
  )
{% endmacro %}
