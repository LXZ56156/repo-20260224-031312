#!/usr/bin/env bash
set -euo pipefail
# Compatibility entry only; the production mirror and tests share the Node engine.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/weapp-sync-preview.js" "$@"
