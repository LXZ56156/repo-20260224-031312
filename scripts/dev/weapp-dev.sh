#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/home/lizixuan/projects/badminton-miniapp"
SYNC_SCRIPT="${PROJECT_DIR}/scripts/dev/weapp-sync-preview.sh"
POWERSHELL_SCRIPT="${PROJECT_DIR}/scripts/dev/start-weapp-preview.ps1"
POWERSHELL_EXE="powershell.exe"
WEAPP_MCP_WSL_CMD="/mnt/d/weapp-mcp-launcher/weapp-mcp.cmd"
WEAPP_MCP_WINDOWS_CMD="D:\\weapp-mcp-launcher\\weapp-mcp.cmd"
WEAPP_MCP_WINDOWS_DIR="D:\\weapp-mcp-launcher"
MCP_HOST="127.0.0.1"
MCP_PORT="9420"
MCP_INITIAL_WAIT_SECONDS=2
MCP_LAUNCH_WAIT_SECONDS=30
MCP_PROBE_TIMEOUT_MS="5000"
LOG_DIR="${PROJECT_DIR}/tmp/weapp-preview"
SYNC_LOG="${LOG_DIR}/weapp-sync-preview.log"
PID_FILE="${LOG_DIR}/weapp-sync-preview.pid"
ACTION="${1:-mcp}"

RUNNING_SYNC_PID=""

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

show_status() {
  if is_sync_running; then
    log "同步状态：running (PID=${RUNNING_SYNC_PID})"
  else
    log "同步状态：stopped"
  fi

  if check_mcp_connection; then
    log "MCP 状态：ready (ws://${MCP_HOST}:${MCP_PORT})"
  else
    log "MCP 状态：not ready (ws://${MCP_HOST}:${MCP_PORT})"
  fi

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
  nohup "$SYNC_SCRIPT" >> "$SYNC_LOG" 2>&1 &
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

main() {
  require_command nohup
  require_command wslpath
  require_command "$POWERSHELL_EXE"

  case "$ACTION" in
    mcp|start)
      log "项目目录：$PROJECT_DIR"
      start_sync
      ensure_mcp_ready
      show_status
      ;;
    preview)
      log "项目目录：$PROJECT_DIR"
      start_sync
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
      fail "不支持的动作：$ACTION，可选值：mcp | start | preview | status | stop"
      ;;
  esac
}

main "$@"
