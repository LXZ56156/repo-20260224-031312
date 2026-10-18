#!/usr/bin/env bash
set -euo pipefail
# Compatibility entry only. Prefer node scripts/dev/weapp-dev.js on all platforms.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/weapp-dev.js" "$@"
