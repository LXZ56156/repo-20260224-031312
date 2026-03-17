#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if rg -n -g '!check-deprecated-wx-api.sh' 'wx\.getSystemInfo(Sync)?\s*\(' miniprogram tests scripts; then
  echo "Deprecated wx system info API detected. Use miniprogram/core/systemInfo.js or the split official APIs instead." >&2
  exit 1
fi

echo "No deprecated wx.getSystemInfo / wx.getSystemInfoSync usage found."
