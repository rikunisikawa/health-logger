{% macro decode_flag(column, bit_value) %}
  (cast({{ column }} as bigint) & {{ bit_value }}) = {{ bit_value }}
{% endmacro %}
