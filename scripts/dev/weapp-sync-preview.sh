#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${SOURCE_DIR:-/home/lizixuan/projects(WSL)/badminton-miniapp}"
PREVIEW_DIR="${PREVIEW_DIR:-/mnt/d/projects(WIN)/badminton-miniapp-preview}"
LOG_DIR="${LOG_DIR:-${SOURCE_DIR}/tmp/weapp-preview}"
PID_FILE="${PID_FILE:-${LOG_DIR}/weapp-sync-preview.pid}"
EVENT_STAMP_FILE="${EVENT_STAMP_FILE:-${LOG_DIR}/weapp-sync-preview.event}"
SYNC_MANIFEST_PATH="${SYNC_MANIFEST_PATH:-${PREVIEW_DIR}/.weapp-preview-sync.json}"
DEBOUNCE_MILLISECONDS="${DEBOUNCE_MILLISECONDS:-400}"
DEBOUNCE_SECONDS="${DEBOUNCE_SECONDS:-0.4}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-0.4}"
ALLOW_UNSAFE_PREVIEW_DIR="${ALLOW_UNSAFE_PREVIEW_DIR:-0}"
SYNC_WATCH_MODE="${SYNC_WATCH_MODE:-auto}"
ACTION="${1:-run}"

WATCH_ROOT_FILES=(
  "project.config.json"
  "project.private.config.json"
)

WATCH_ROOT_DIRS=(
  "miniprogram"
  "cloudfunctions"
  "miniprogram_npm"
)

DEBOUNCE_JOB_PID=""
CURRENT_SYNC_PID=""

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

canonicalize_path() {
  realpath -m "$1"
}

ensure_single_instance() {
  mkdir -p "$LOG_DIR"

  if [[ -f "$PID_FILE" ]]; then
    local existing_pid
    existing_pid="$(<"$PID_FILE")"
    if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
      fail "同步脚本已在运行，PID=${existing_pid}"
    fi
  fi

  printf '%s\n' "$$" > "$PID_FILE"
  CURRENT_SYNC_PID="$$"
}

cleanup() {
  if [[ -n "${DEBOUNCE_JOB_PID}" ]] && kill -0 "${DEBOUNCE_JOB_PID}" 2>/dev/null; then
    kill "${DEBOUNCE_JOB_PID}" 2>/dev/null || true
  fi

  if [[ -f "$PID_FILE" ]]; then
    local recorded_pid
    recorded_pid="$(<"$PID_FILE")"
    if [[ "$recorded_pid" == "$CURRENT_SYNC_PID" ]]; then
      rm -f "$PID_FILE"
    fi
  fi
}

ensure_safe_preview_dir() {
  local resolved_source resolved_preview preview_parent
  resolved_source="$(canonicalize_path "$SOURCE_DIR")"
  resolved_preview="$(canonicalize_path "$PREVIEW_DIR")"
  preview_parent="$(dirname "$resolved_preview")"

  [[ -n "$resolved_preview" ]] || fail "PREVIEW_DIR 不能为空"
  [[ "$resolved_preview" != "/" ]] || fail "PREVIEW_DIR 不能指向根目录"
  [[ "$resolved_preview" != "$resolved_source" ]] || fail "PREVIEW_DIR 不能与 SOURCE_DIR 相同"

  if [[ "$ALLOW_UNSAFE_PREVIEW_DIR" != "1" ]]; then
    case "$resolved_preview" in
      /mnt/?/*/*) ;;
      *)
        fail "PREVIEW_DIR 必须是 /mnt 下的预览目录，当前：$resolved_preview"
        ;;
    esac

    case "$preview_parent" in
      /|/mnt|/mnt/?)
        fail "PREVIEW_DIR 层级过浅，不允许执行删除同步：$resolved_preview"
        ;;
    esac
  fi

  if [[ -e "$PREVIEW_DIR" && -L "$PREVIEW_DIR" ]]; then
    fail "PREVIEW_DIR 不能是符号链接：$PREVIEW_DIR"
  fi

  mkdir -p "$PREVIEW_DIR"
}

build_rsync_args() {
  RSYNC_ARGS=(
    --archive
    --delete
    --delete-delay
    --delete-excluded
    --human-readable
    --itemize-changes
    --prune-empty-dirs
    "--exclude=/.git/"
    "--exclude=/.idea/"
    "--exclude=/.vscode/"
    "--exclude=/dist/"
    "--exclude=/coverage/"
    "--exclude=/tmp/"
    "--exclude=**/.git/"
    "--exclude=**/node_modules/"
    "--exclude=**/.idea/"
    "--exclude=**/.vscode/"
    "--exclude=**/dist/"
    "--exclude=**/coverage/"
    "--exclude=**/tmp/"
    "--exclude=**/*.tmp"
    "--exclude=**/*.swp"
    "--exclude=**/*.swo"
    "--exclude=**/*.cache"
    "--exclude=**/*.log"
    "--exclude=**/.DS_Store"
    "--include=/project.config.json"
    "--include=/project.private.config.json"
    "--include=/miniprogram/"
    "--include=/miniprogram/***"
    "--include=/cloudfunctions/"
    "--include=/cloudfunctions/***"
    "--include=/miniprogram_npm/"
    "--include=/miniprogram_npm/***"
    "--exclude=*"
  )
}

emit_content_signature_entry() {
  local relative_path="$1"

  if [[ -L "$relative_path" ]]; then
    printf 'l\t%s\t%s\n' "$relative_path" "$(readlink "$relative_path")"
    return 0
  fi

  if [[ -f "$relative_path" ]]; then
    printf 'f\t%s\t%s\n' "$relative_path" "$(sha1sum "$relative_path" | awk '{print $1}')"
  fi
}

build_tree_signature() {
  local root_dir="$1"
  (
    cd "$root_dir"

    for relative_file in "${WATCH_ROOT_FILES[@]}"; do
      if [[ -e "$relative_file" ]]; then
        emit_content_signature_entry "$relative_file"
      fi
    done

    for relative_dir in "${WATCH_ROOT_DIRS[@]}"; do
      if [[ -e "$relative_dir" ]]; then
        find "$relative_dir" \
          \( -type d \( -name .git -o -name node_modules -o -name .idea -o -name .vscode -o -name dist -o -name coverage -o -name tmp \) -prune \) -o \
          \( -type f -o -type l \) \
          ! -name '*.tmp' \
          ! -name '*.swp' \
          ! -name '*.swo' \
          ! -name '*.cache' \
          ! -name '*.log' \
          ! -name '.DS_Store' \
          -print0 | while IFS= read -r -d '' relative_path; do
            emit_content_signature_entry "$relative_path"
          done
      fi
    done
  ) | LC_ALL=C sort | sha1sum | awk '{print $1}'
}

build_fast_tree_signature() {
  local root_dir="$1"
  (
    cd "$root_dir"

    for relative_file in "${WATCH_ROOT_FILES[@]}"; do
      if [[ -e "$relative_file" ]]; then
        stat --printf 'f\t%n\t%s\t%Y\n' "$relative_file"
      fi
    done

    for relative_dir in "${WATCH_ROOT_DIRS[@]}"; do
      if [[ -e "$relative_dir" ]]; then
        find "$relative_dir" \
          \( -type d \( -name .git -o -name node_modules -o -name .idea -o -name .vscode -o -name dist -o -name coverage -o -name tmp \) -prune \) -o \
          \( -type f -o -type l \) \
          ! -name '*.tmp' \
          ! -name '*.swp' \
          ! -name '*.swo' \
          ! -name '*.cache' \
          ! -name '*.log' \
          ! -name '.DS_Store' \
          -printf '%y\t%p\t%s\t%T@\n'
      fi
    done
  ) | LC_ALL=C sort | sha1sum | awk '{print $1}'
}

build_source_signature() {
  build_tree_signature "$SOURCE_DIR"
}

build_preview_signature() {
  build_tree_signature "$PREVIEW_DIR"
}

build_source_change_signature() {
  build_fast_tree_signature "$SOURCE_DIR"
}

write_sync_manifest() {
  local signature="$1"
  local synced_at
  synced_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  node - "$SYNC_MANIFEST_PATH" "$SOURCE_DIR" "$PREVIEW_DIR" "$signature" "$synced_at" <<'EOF'
const fs = require('fs');
const path = require('path');

const [manifestPath, sourceDir, previewDir, signature, syncedAt] = process.argv.slice(2);

const payload = {
  sourceDir,
  previewDir,
  signature,
  syncedAt
};

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
EOF
}

perform_sync() {
  local reason="$1"
  local preview_signature
  log "开始同步到预览目录：$PREVIEW_DIR"
  log "同步原因：$reason"

  if rsync "${RSYNC_ARGS[@]}" "${SOURCE_DIR}/" "${PREVIEW_DIR}/"; then
    if [[ "${WEAPP_SYNC_PREVIEW_FAST_SIGNATURE:-0}" == "1" ]]; then
      preview_signature="$(build_source_signature)"
    else
      preview_signature="$(build_preview_signature)"
    fi
    write_sync_manifest "$preview_signature" || fail "写入同步清单失败：$SYNC_MANIFEST_PATH"
    log "同步完成：$reason"
  else
    fail "rsync 同步失败：$reason"
  fi
}

debounce_worker() {
  while true; do
    local seen_stamp current_stamp
    seen_stamp="$(<"$EVENT_STAMP_FILE")"
    sleep "$DEBOUNCE_SECONDS"
    current_stamp="$(<"$EVENT_STAMP_FILE")"

    if [[ "$seen_stamp" != "$current_stamp" ]]; then
      continue
    fi

    perform_sync "事件监听变更"
    current_stamp="$(<"$EVENT_STAMP_FILE")"
    if [[ "$seen_stamp" == "$current_stamp" ]]; then
      return 0
    fi
  done
}

schedule_debounced_sync() {
  date +%s%3N > "$EVENT_STAMP_FILE"

  if [[ -n "${DEBOUNCE_JOB_PID}" ]] && kill -0 "${DEBOUNCE_JOB_PID}" 2>/dev/null; then
    return 0
  fi

  debounce_worker &
  DEBOUNCE_JOB_PID=$!
}

watch_with_inotify() {
  local watch_paths=()
  local relative_path
  local inotify_fd
  local source_dir_regex
  local inotify_exclude_regex

  for relative_path in "${WATCH_ROOT_FILES[@]}" "${WATCH_ROOT_DIRS[@]}"; do
    if [[ -e "${SOURCE_DIR}/${relative_path}" ]]; then
      watch_paths+=("${SOURCE_DIR}/${relative_path}")
    fi
  done

  (( ${#watch_paths[@]} > 0 )) || fail "未找到可监听路径"
  source_dir_regex="$(node -e 'process.stdout.write(process.argv[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));' "$SOURCE_DIR")"
  inotify_exclude_regex="^${source_dir_regex}/(.*/)?(\.git|node_modules|\.idea|\.vscode|dist|coverage|tmp)(/|$)|(\.tmp$|\.swp$|\.swo$|\.cache$|\.log$|\.DS_Store$)"

  log "使用 inotifywait 监听源码变更，防抖 ${DEBOUNCE_MILLISECONDS}ms"
  exec {inotify_fd}< <(
    inotifywait -m -r --quiet \
      --format '%w%f' \
      -e modify -e create -e delete -e move \
      --exclude "$inotify_exclude_regex" \
      "${watch_paths[@]}"
  )

  # Establish file watches before publishing the initial manifest. Otherwise a
  # source edit can land between the first sync and the inotify listener startup.
  sleep "$POLL_INTERVAL_SECONDS"
  perform_sync "初始同步"

  while IFS= read -r _event <&"$inotify_fd"; do
    schedule_debounced_sync
  done
}

watch_with_polling() {
  local last_signature current_signature changed_at_ms current_ms
  local has_pending_change=0

  last_signature="$(build_source_change_signature)"
  changed_at_ms=0

  log "未检测到 inotifywait，改用 ${POLL_INTERVAL_SECONDS}s 轮询监听，防抖 ${DEBOUNCE_MILLISECONDS}ms"

  while true; do
    sleep "$POLL_INTERVAL_SECONDS"
    current_signature="$(build_source_change_signature)"
    current_ms="$(date +%s%3N)"

    if [[ "$current_signature" != "$last_signature" ]]; then
      last_signature="$current_signature"
      changed_at_ms="$current_ms"

      if (( has_pending_change == 0 )); then
        log "检测到源码变更，开始防抖等待"
      else
        log "检测到连续变更，重置防抖计时"
      fi

      has_pending_change=1
      continue
    fi

    if (( has_pending_change == 1 )) && (( current_ms - changed_at_ms >= DEBOUNCE_MILLISECONDS )); then
      perform_sync "轮询监听变更"
      has_pending_change=0
    fi
  done
}

main() {
  require_command rsync
  require_command realpath
  require_command sha1sum
  require_command stat
  require_command find
  require_command node

  case "$ACTION" in
    run)
      build_rsync_args
      ensure_single_instance
      trap cleanup EXIT INT TERM
      ensure_safe_preview_dir
      printf '0\n' > "$EVENT_STAMP_FILE"

      log "源目录：$SOURCE_DIR"
      log "预览目录：$PREVIEW_DIR"
      log "PID 文件：$PID_FILE"
      log "同步清单：$SYNC_MANIFEST_PATH"
      case "$SYNC_WATCH_MODE" in
        auto)
          if command -v inotifywait >/dev/null 2>&1; then
            watch_with_inotify
          else
            perform_sync "初始同步"
            watch_with_polling
          fi
          ;;
        inotify)
          require_command inotifywait
          watch_with_inotify
          ;;
        polling)
          perform_sync "初始同步"
          watch_with_polling
          ;;
        test-once)
          perform_sync "初始同步"
          log "测试模式：完成一次同步后保持进程存活"
          while true; do
            sleep 3600
          done
          ;;
        *)
          fail "不支持的监听模式：$SYNC_WATCH_MODE，可选值：auto | inotify | polling | test-once"
          ;;
      esac
      ;;
    signature)
      build_source_signature
      ;;
    sync-once)
      build_rsync_args
      ensure_safe_preview_dir
      perform_sync "手动一次性同步"
      ;;
    *)
      fail "不支持的动作：$ACTION，可选值：run | signature | sync-once"
      ;;
  esac
}

main "$@"
