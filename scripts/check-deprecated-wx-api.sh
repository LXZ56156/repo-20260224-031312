#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SEARCH_PATTERN='wx\.(getSystemInfo(Sync)?|saveFile|removeSavedFile)\s*\('

if command -v rg >/dev/null 2>&1 && rg --version >/dev/null 2>&1; then
  SEARCH_CMD=(rg -n -g '!check-deprecated-wx-api.sh' "$SEARCH_PATTERN" miniprogram tests scripts cloudfunctions)
else
  SEARCH_CMD=(grep -RInE --exclude check-deprecated-wx-api.sh "$SEARCH_PATTERN" miniprogram tests scripts cloudfunctions)
fi

if "${SEARCH_CMD[@]}"; then
  echo "Deprecated wx API detected. Do not use wx.getSystemInfo/getSystemInfoSync/saveFile/removeSavedFile." >&2
  echo "Use miniprogram/core/systemInfo.js or the split official APIs, plus wx.getFileSystemManager().saveFile/removeSavedFile instead." >&2
  exit 1
fi

echo "No deprecated wx.getSystemInfo / wx.getSystemInfoSync / wx.saveFile / wx.removeSavedFile usage found."
