#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rg >/dev/null 2>&1; then
  echo "Required tool rg (ripgrep) was not found in PATH." >&2
  exit 127
fi

if rg -n -g '!check-deprecated-wx-api.sh' -g '!miniprogram/miniprogram_npm/**' 'wx\.(getSystemInfo(Sync)?|saveFile|removeSavedFile)\s*\(' miniprogram tests scripts cloudfunctions; then
  echo "Deprecated wx API detected. Do not use wx.getSystemInfo/getSystemInfoSync/saveFile/removeSavedFile." >&2
  echo "Use miniprogram/core/systemInfo.js or the split official APIs, plus wx.getFileSystemManager().saveFile/removeSavedFile instead." >&2
  exit 1
else
  rg_status=$?
  if [[ "$rg_status" -ne 1 ]]; then
    echo "Deprecated wx API scan failed (rg exit $rg_status)." >&2
    exit "$rg_status"
  fi
fi

echo "No deprecated wx.getSystemInfo / wx.getSystemInfoSync / wx.saveFile / wx.removeSavedFile usage found."
