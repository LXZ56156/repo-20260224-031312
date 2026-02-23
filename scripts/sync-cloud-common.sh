#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_FILE="$ROOT_DIR/scripts/cloud-common.template.js"

if [[ ! -f "$TEMPLATE_FILE" ]]; then
  echo "template not found: $TEMPLATE_FILE" >&2
  exit 1
fi

for fn_dir in "$ROOT_DIR"/cloudfunctions/*; do
  [[ -d "$fn_dir" ]] || continue
  mkdir -p "$fn_dir/lib"
  cp "$TEMPLATE_FILE" "$fn_dir/lib/common.js"
done

echo "cloud common synced to cloudfunctions/*/lib/common.js"
