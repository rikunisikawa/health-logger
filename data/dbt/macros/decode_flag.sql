-- Athena (Presto/Trino) は & 演算子をサポートしないため bitwise_and() を使う
{% macro decode_flag(column, bit_value) %}
  bitwise_and(cast({{ column }} as bigint), {{ bit_value }}) = {{ bit_value }}
{% endmacro %}
