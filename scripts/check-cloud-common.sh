#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT_DIR/scripts/cloud-lib-sync-common.sh"

mapfile -t template_files < <(discover_cloud_templates)
if [[ "${#template_files[@]}" -eq 0 ]]; then
  echo "no cloud common templates found under $ROOT_DIR/scripts" >&2
  exit 1
fi

status=0
for fn_dir in $(list_cloudfunction_dirs); do
  for template_file in "${template_files[@]}"; do
    target_name="$(template_target_basename "$template_file")"
    target_file="$fn_dir/lib/${target_name}.js"
    if [[ ! -f "$target_file" ]]; then
      echo "missing shared lib: ${target_file#$ROOT_DIR/}" >&2
      status=1
      continue
    fi
    if ! cmp -s "$template_file" "$target_file"; then
      echo "shared lib mismatch: ${target_file#$ROOT_DIR/}" >&2
      diff -u "$template_file" "$target_file" || true
      status=1
    fi
  done
done

if [[ "$status" -ne 0 ]]; then
  echo "cloud shared lib check failed; run: bash scripts/sync-cloud-common.sh" >&2
  exit "$status"
fi

echo "cloud shared lib check passed"
