#!/usr/bin/env bash
set -euo pipefail

for a in "$@"; do
  if [[ "$a" == "apply" || "$a" == "destroy" ]]; then
    echo "ERROR: apply/destroy is not allowed via this wrapper." >&2
    exit 1
  fi
done

terraform plan "$@"
