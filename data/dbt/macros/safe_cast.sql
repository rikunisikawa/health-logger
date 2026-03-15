{% macro safe_cast(column, type, default=None) %}
  {% if default is not none %}
    coalesce(try_cast({{ column }} as {{ type }}), {{ default }})
  {% else %}
    try_cast({{ column }} as {{ type }})
  {% endif %}
{% endmacro %}
