#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT_DIR/scripts/cloud-lib-sync-common.sh"

mapfile -t template_files < <(discover_cloud_templates)
if [[ "${#template_files[@]}" -eq 0 ]]; then
  echo "no cloud common templates found under $ROOT_DIR/scripts" >&2
  exit 1
fi

for fn_dir in $(list_cloudfunction_dirs); do
  mkdir -p "$fn_dir/lib"
  for template_file in "${template_files[@]}"; do
    target_name="$(template_target_basename "$template_file")"
    target_file="$fn_dir/lib/${target_name}.js"
    # Avoid reopening unchanged files held briefly by Windows scanners/readers.
    if ! cmp -s "$template_file" "$target_file"; then
      cp "$template_file" "$target_file"
    fi
  done
done

printf 'cloud common synced to cloudfunctions/*/lib from templates: %s\n' \
  "$(printf '%s ' "${template_files[@]}" | sed 's/[[:space:]]*$//')"
