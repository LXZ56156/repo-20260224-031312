#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/lizixuan/projects/badminton-miniapp}"
SOURCE_DIR="${SOURCE_DIR:-$PROJECT_DIR}"
PREVIEW_DIR="${PREVIEW_DIR:-/mnt/d/projects/badminton-miniapp-preview}"
LOG_DIR="${LOG_DIR:-${PROJECT_DIR}/tmp/weapp-preview}"
SYNC_LOG="${SYNC_LOG:-${LOG_DIR}/weapp-sync-preview.log}"
PID_FILE="${PID_FILE:-${LOG_DIR}/weapp-sync-preview.pid}"
SYNC_MANIFEST_PATH="${SYNC_MANIFEST_PATH:-${PREVIEW_DIR}/.weapp-preview-sync.json}"
SYNC_SCRIPT="${SYNC_SCRIPT:-${PROJECT_DIR}/scripts/dev/weapp-sync-preview.sh}"
POWERSHELL_SCRIPT="${POWERSHELL_SCRIPT:-${PROJECT_DIR}/scripts/dev/start-weapp-preview.ps1}"
POWERSHELL_EXE="${POWERSHELL_EXE:-powershell.exe}"
WEAPP_MCP_WSL_CMD="${WEAPP_MCP_WSL_CMD:-/mnt/d/weapp-mcp-launcher/weapp-mcp.cmd}"
WEAPP_MCP_WINDOWS_CMD="${WEAPP_MCP_WINDOWS_CMD:-D:\\weapp-mcp-launcher\\weapp-mcp.cmd}"
WEAPP_MCP_WINDOWS_DIR="${WEAPP_MCP_WINDOWS_DIR:-D:\\weapp-mcp-launcher}"
MCP_HOST="${MCP_HOST:-127.0.0.1}"
MCP_PORT="${MCP_PORT:-9420}"
MCP_INITIAL_WAIT_SECONDS="${MCP_INITIAL_WAIT_SECONDS:-2}"
MCP_LAUNCH_WAIT_SECONDS="${MCP_LAUNCH_WAIT_SECONDS:-30}"
MCP_PROBE_TIMEOUT_MS="${MCP_PROBE_TIMEOUT_MS:-5000}"
MIRROR_WAIT_SECONDS="${MIRROR_WAIT_SECONDS:-10}"
ACTION="${1:-mcp}"

RUNNING_SYNC_PID=""
MIRROR_STATUS_KEY="unknown"
MIRROR_STATUS_LABEL="未知"
MIRROR_DETAIL="缺少同步信息"
MIRROR_SYNCED_AT="未知"

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || fail "缺少命令：$command_name"
}

is_sync_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(<"$PID_FILE")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      RUNNING_SYNC_PID="$pid"
      return 0
    fi
  fi

  RUNNING_SYNC_PID=""
  return 1
}

read_manifest_fields() {
  node - "$SYNC_MANIFEST_PATH" <<'EOF'
const fs = require('fs');

const manifestPath = process.argv[2];
const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

process.stdout.write([
  data.signature || '',
  data.syncedAt || '',
  data.sourceDir || '',
  data.previewDir || ''
].join('\t'));
EOF
}

collect_mirror_status() {
  local manifest_signature manifest_source_dir manifest_preview_dir source_signature fields

  MIRROR_STATUS_KEY="unknown"
  MIRROR_STATUS_LABEL="未知"
  MIRROR_DETAIL="缺少同步信息"
  MIRROR_SYNCED_AT="未知"

  if [[ ! -d "$PREVIEW_DIR" ]]; then
    MIRROR_DETAIL="预览目录不存在：$PREVIEW_DIR"
    return 0
  fi

  if [[ ! -f "$SYNC_MANIFEST_PATH" ]]; then
    MIRROR_DETAIL="缺少同步清单，请重新执行 ./scripts/dev/weapp-dev.sh start"
    return 0
  fi

  if ! fields="$(read_manifest_fields 2>/dev/null)"; then
    MIRROR_DETAIL="同步清单损坏：$SYNC_MANIFEST_PATH"
    return 0
  fi

  IFS=$'\t' read -r manifest_signature MIRROR_SYNCED_AT manifest_source_dir manifest_preview_dir <<<"$fields"

  if [[ -n "$manifest_source_dir" && "$manifest_source_dir" != "$SOURCE_DIR" ]]; then
    MIRROR_DETAIL="同步清单 sourceDir 不匹配：$manifest_source_dir"
    return 0
  fi

  if [[ -n "$manifest_preview_dir" && "$manifest_preview_dir" != "$PREVIEW_DIR" ]]; then
    MIRROR_DETAIL="同步清单 previewDir 不匹配：$manifest_preview_dir"
    return 0
  fi

  source_signature="$("$SYNC_SCRIPT" signature)"
  if [[ "$source_signature" == "$manifest_signature" ]]; then
    MIRROR_STATUS_KEY="current"
    MIRROR_STATUS_LABEL="已同步"
    if is_sync_running; then
      MIRROR_DETAIL="源码与预览目录一致"
    else
      MIRROR_DETAIL="当前一致，但自动同步未运行"
    fi
    return 0
  fi

  MIRROR_STATUS_KEY="stale"
  MIRROR_STATUS_LABEL="已过期"
  MIRROR_DETAIL="上次同步 ${MIRROR_SYNCED_AT}，源码已变化"
  return 0
}

wait_for_mirror_current() {
  local timeout_seconds="$1"
  local elapsed=0

  while (( elapsed < timeout_seconds )); do
    collect_mirror_status
    if [[ "$MIRROR_STATUS_KEY" == "current" ]]; then
      return 0
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  collect_mirror_status
  return 1
}

show_status() {
  local sync_running=false
  local mcp_state="not ready"
  local pipeline_state="degraded"
  local pipeline_detail

  if is_sync_running; then
    sync_running=true
  fi

  collect_mirror_status

  if check_mcp_connection; then
    mcp_state="ready"
  fi

  if [[ "$mcp_state" == "ready" && "$sync_running" == true && "$MIRROR_STATUS_KEY" == "current" ]]; then
    pipeline_state="ready"
    pipeline_detail="MCP 与镜像同步均可用"
  elif [[ "$mcp_state" != "ready" ]]; then
    pipeline_detail="MCP 未就绪"
  elif [[ "$MIRROR_STATUS_KEY" != "current" ]]; then
    pipeline_detail="镜像未同步到最新源码"
  else
    pipeline_detail="自动同步未运行"
  fi

  log "开发链路：${pipeline_state} (${pipeline_detail})"

  if [[ "$sync_running" == true ]]; then
    log "同步状态：running (PID=${RUNNING_SYNC_PID})"
  else
    log "同步状态：stopped"
  fi

  log "镜像状态：${MIRROR_STATUS_LABEL} (${MIRROR_DETAIL})"
  log "同步清单：$SYNC_MANIFEST_PATH"
  log "MCP 状态：${mcp_state} (ws://${MCP_HOST}:${MCP_PORT})"
  log "同步日志：$SYNC_LOG"
  log "PowerShell 脚本：$POWERSHELL_SCRIPT"
  log "MCP 启动器：$WEAPP_MCP_WSL_CMD"
}

start_sync() {
  mkdir -p "$LOG_DIR"

  if is_sync_running; then
    log "同步脚本已运行，PID=${RUNNING_SYNC_PID}"
    return 0
  fi

  log "启动同步脚本：$SYNC_SCRIPT"
  nohup "$SYNC_SCRIPT" run >> "$SYNC_LOG" 2>&1 &
  disown || true
  sleep 1

  if is_sync_running; then
    log "同步脚本已启动，PID=${RUNNING_SYNC_PID}"
    return 0
  fi

  fail "同步脚本启动失败，请查看日志：$SYNC_LOG"
}

stop_sync() {
  if ! is_sync_running; then
    log "同步脚本未运行，无需停止"
    return 0
  fi

  log "停止同步脚本，PID=${RUNNING_SYNC_PID}"
  kill "${RUNNING_SYNC_PID}" 2>/dev/null || true
  sleep 1

  if is_sync_running; then
    fail "同步脚本仍在运行，请检查：$SYNC_LOG"
  fi

  rm -f "$PID_FILE"
  log "同步脚本已停止"
}

ensure_mirror_current() {
  log "检查镜像同步状态：$PREVIEW_DIR"
  if wait_for_mirror_current "$MIRROR_WAIT_SECONDS"; then
    log "镜像已同步：$MIRROR_DETAIL"
    return 0
  fi

  fail "镜像未同步完成：$MIRROR_DETAIL"
}

start_wechat_preview() {
  local windows_script_path
  windows_script_path="$(wslpath -w "$POWERSHELL_SCRIPT")"

  log "启动微信开发者工具预览"
  "$POWERSHELL_EXE" -NoProfile -ExecutionPolicy Bypass -File "$windows_script_path"
}

check_mcp_connection() {
  "$POWERSHELL_EXE" -NoProfile -ExecutionPolicy Bypass -Command "\
\$ErrorActionPreference = 'Stop'; \
\$uri = [Uri]::new('ws://${MCP_HOST}:${MCP_PORT}'); \
\$probeMessage = '{\"id\":\"probe-tool-info\",\"method\":\"Tool.getInfo\",\"params\":{}}'; \
\$ws = [Net.WebSockets.ClientWebSocket]::new(); \
\$cts = New-Object Threading.CancellationTokenSource; \
\$cts.CancelAfter(${MCP_PROBE_TIMEOUT_MS}); \
try { \
  \$null = \$ws.ConnectAsync(\$uri, \$cts.Token).GetAwaiter().GetResult(); \
  \$payload = [Text.Encoding]::UTF8.GetBytes(\$probeMessage); \
  \$segment = [ArraySegment[byte]]::new(\$payload); \
  \$null = \$ws.SendAsync(\$segment, [Net.WebSockets.WebSocketMessageType]::Text, \$true, \$cts.Token).GetAwaiter().GetResult(); \
  \$buffer = New-Object byte[] 4096; \
  \$result = \$ws.ReceiveAsync([ArraySegment[byte]]::new(\$buffer), \$cts.Token).GetAwaiter().GetResult(); \
  if (\$result.MessageType -ne [Net.WebSockets.WebSocketMessageType]::Text) { exit 1 }; \
  \$text = [Text.Encoding]::UTF8.GetString(\$buffer, 0, \$result.Count); \
  \$message = ConvertFrom-Json \$text; \
  if (\$message.id -ne 'probe-tool-info' -or -not \$message.result.version -or -not \$message.result.SDKVersion) { exit 1 }; \
  exit 0 \
} catch { \
  exit 1 \
} finally { \
  if (\$cts) { \$cts.Dispose() }; \
  if (\$ws) { \$ws.Dispose() } \
}" >/dev/null 2>&1
}

wait_for_mcp_connection() {
  local timeout_seconds="$1"
  local elapsed=0

  while (( elapsed < timeout_seconds )); do
    if check_mcp_connection; then
      return 0
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

run_weapp_mcp_launcher() {
  [[ -f "$WEAPP_MCP_WSL_CMD" ]] || fail "MCP 启动器不存在：$WEAPP_MCP_WSL_CMD"

  log "现有 MCP 连接不可用，执行 $WEAPP_MCP_WSL_CMD"
  "$POWERSHELL_EXE" -NoProfile -ExecutionPolicy Bypass -Command "\$env:WEAPP_MCP_NO_PAUSE='1'; Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','${WEAPP_MCP_WINDOWS_CMD}' -WorkingDirectory '${WEAPP_MCP_WINDOWS_DIR}' | Out-Null"
}

ensure_mcp_ready() {
  log "检查 MCP 连接：ws://${MCP_HOST}:${MCP_PORT}"
  if wait_for_mcp_connection "$MCP_INITIAL_WAIT_SECONDS"; then
    log "检测到可用的 MCP 连接"
    return 0
  fi

  run_weapp_mcp_launcher

  if wait_for_mcp_connection "$MCP_LAUNCH_WAIT_SECONDS"; then
    log "MCP 连接已就绪：ws://${MCP_HOST}:${MCP_PORT}"
    return 0
  fi

  fail "执行 weapp-mcp.cmd 后仍无法连接 ws://${MCP_HOST}:${MCP_PORT}"
}

patch_weapp_mcp_screenshot_timeout() {
  # mp_screenshot 工具默认使用 globalTimeoutMs=15000，截图容易超时。
  # 找到 npx 缓存的 application.js 并将 screenshot 工具的 timeoutMs 设为 60000。
  local app_js
  app_js=$(find "$HOME/.npm/_npx" -name "application.js" \
    -path "*weapp-dev-mcp*" 2>/dev/null | head -1)
  if [[ -z "$app_js" ]]; then
    return 0
  fi
  if grep -q 'timeoutMs: 60000' "$app_js" 2>/dev/null; then
    return 0
  fi
  # 在 createScreenshotTool 返回对象的末尾（closing }; 前）插入 timeoutMs
  sed -i 's/throw new UserError("截图未产生图片数据。");\n.*});\n.*},\n.*};\n}\nfunction createCallWxMethodTool//' "$app_js" 2>/dev/null || true
  node -e "
const fs = require('fs');
const src = fs.readFileSync('$app_js', 'utf8');
const marker = 'throw new UserError(\"截图未产生图片数据。\");';
const insert = '        timeoutMs: 60000,';
const after = '    };\n}\nfunction createCallWxMethodTool';
const patched = src.replace(
  marker + '\n            });\n        },\n    };\n}\nfunction createCallWxMethodTool',
  marker + '\n            });\n        },\n        ' + 'timeoutMs: 60000,\n    };\n}\nfunction createCallWxMethodTool'
);
if (patched === src) { process.exit(1); }
fs.writeFileSync('$app_js', patched);
" 2>/dev/null && log "mp_screenshot timeoutMs 已修补为 60000ms" || true
}

main() {
  require_command "$POWERSHELL_EXE"
  require_command "$SYNC_SCRIPT"
  require_command node

  case "$ACTION" in
    mcp|start)
      require_command nohup
      log "项目目录：$PROJECT_DIR"
      patch_weapp_mcp_screenshot_timeout
      start_sync
      ensure_mirror_current
      ensure_mcp_ready
      show_status
      ;;
    mirror)
      require_command nohup
      log "项目目录：$PROJECT_DIR"
      start_sync
      ensure_mirror_current
      ;;
    preview)
      require_command nohup
      require_command wslpath
      log "项目目录：$PROJECT_DIR"
      start_sync
      ensure_mirror_current
      show_status
      start_wechat_preview
      ;;
    status)
      show_status
      ;;
    stop)
      stop_sync
      ;;
    *)
      fail "不支持的动作：$ACTION，可选值：mcp | start | mirror | preview | status | stop"
      ;;
  esac
}

main "$@"
