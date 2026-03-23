#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if rg -n -g '!check-deprecated-wx-api.sh' 'wx\.(getSystemInfo(Sync)?|saveFile|removeSavedFile)\s*\(' miniprogram tests scripts cloudfunctions; then
  echo "Deprecated wx API detected. Do not use wx.getSystemInfo/getSystemInfoSync/saveFile/removeSavedFile." >&2
  echo "Use miniprogram/core/systemInfo.js or the split official APIs, plus wx.getFileSystemManager().saveFile/removeSavedFile instead." >&2
  exit 1
fi

echo "No deprecated wx.getSystemInfo / wx.getSystemInfoSync / wx.saveFile / wx.removeSavedFile usage found."
