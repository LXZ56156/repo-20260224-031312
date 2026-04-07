#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WEAPP_DEV_SCRIPT="${PROJECT_DIR}/scripts/dev/weapp-dev.sh"
MODE="${1:-mirror}"

case "$MODE" in
  mirror|mcp) ;;
  *)
    echo "unsupported mode: ${MODE}" >&2
    exit 1
    ;;
esac

tmp_log="$(mktemp)"
trap 'rm -f "$tmp_log"' EXIT

if ! "$WEAPP_DEV_SCRIPT" "$MODE" >"$tmp_log" 2>&1; then
  cat "$tmp_log" >&2
  exit 1
fi
