#!/usr/bin/env bash

CLOUD_LIB_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

discover_cloud_templates() {
  find "$CLOUD_LIB_ROOT_DIR/scripts" -maxdepth 1 -type f -name '*-common.template.js' | LC_ALL=C sort
}

template_target_basename() {
  local template_path="$1"
  local template_name
  template_name="$(basename "$template_path")"
  if [[ "$template_name" == "cloud-common.template.js" ]]; then
    printf '%s\n' "common"
    return
  fi
  printf '%s\n' "${template_name%-common.template.js}"
}

list_cloudfunction_dirs() {
  find "$CLOUD_LIB_ROOT_DIR/cloudfunctions" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort
}
