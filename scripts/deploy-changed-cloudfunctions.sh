#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/cloudbaserc.json"

cd "$PROJECT_ROOT"

print_help() {
  cat <<'EOF'
Usage:
  bash scripts/deploy-changed-cloudfunctions.sh [--commit HEAD]
  bash scripts/deploy-changed-cloudfunctions.sh --range <from>..<to>
  bash scripts/deploy-changed-cloudfunctions.sh --files-from <path|-> --dry-run

Options:
  --commit <commit>      Inspect changed files in one commit. Defaults to HEAD.
  --range <range>        Inspect changed files in a git diff range.
  --files-from <path|->  Read changed file paths from a file or stdin.
  --dry-run              Print the deployment plan without checks or deployment.
  --allow-dirty          Skip dirty worktree protection. Intended for dry runs/tests.
  --help                 Show this help message.

Examples:
  npm run deploy:cloud:changed
  npm run deploy:cloud:changed -- --commit HEAD
  npm run deploy:cloud:changed -- --range origin/master..HEAD
  git diff --name-only HEAD~1..HEAD | bash scripts/deploy-changed-cloudfunctions.sh --files-from - --dry-run
EOF
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_config() {
  if [ ! -f "$CONFIG_FILE" ]; then
    fail "cloudbaserc.json not found at project root: $CONFIG_FILE"
  fi
}

read_functions() {
  node - "$CONFIG_FILE" <<'NODE'
const fs = require('node:fs')

const configPath = process.argv[2]
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const functions = Array.isArray(config.functions) ? config.functions : []

for (const item of functions) {
  if (typeof item === 'string') {
    console.log(item)
  } else if (item && typeof item.name === 'string') {
    console.log(item.name)
  }
}
NODE
}

load_functions() {
  FUNCTIONS=()
  while IFS= read -r function_name; do
    if [ -n "$function_name" ]; then
      FUNCTIONS+=("$function_name")
    fi
  done < <(read_functions)

  if [ "${#FUNCTIONS[@]}" -eq 0 ]; then
    fail "No functions configured in cloudbaserc.json"
  fi
}

function_exists() {
  local target="$1"
  local function_name

  for function_name in "${FUNCTIONS[@]}"; do
    if [ "$function_name" = "$target" ]; then
      return 0
    fi
  done

  return 1
}

changed_files_include() {
  local target="$1"
  local changed_file

  for changed_file in "${CHANGED_FILES[@]}"; do
    if [ "$changed_file" = "$target" ]; then
      return 0
    fi
  done

  return 1
}

function_existed_before_change() {
  local function_name="$1"
  local base_ref

  if [ -n "$FILES_FROM" ]; then
    return 2
  fi

  if [ -n "$RANGE" ]; then
    base_ref="${RANGE%%..*}"
  else
    base_ref="$COMMIT^"
  fi

  if git cat-file -e "$base_ref:cloudfunctions/$function_name" 2>/dev/null; then
    return 0
  fi

  return 1
}

changed_set_looks_like_new_function() {
  local function_name="$1"

  changed_files_include "cloudfunctions/$function_name/index.js" || return 1
  changed_files_include "cloudfunctions/$function_name/package.json" || return 1

  return 0
}

lib_change_allowed_for_function() {
  local function_name="$1"

  if function_existed_before_change "$function_name"; then
    return 1
  fi

  local existed_status=$?
  if [ "$existed_status" -eq 1 ]; then
    return 0
  fi

  changed_set_looks_like_new_function "$function_name"
}

read_changed_files() {
  if [ -n "$FILES_FROM" ]; then
    if [ "$FILES_FROM" = "-" ]; then
      cat
    else
      cat "$FILES_FROM"
    fi
    return
  fi

  if [ -n "$RANGE" ]; then
    git diff --name-only "$RANGE"
    return
  fi

  git diff-tree --root --no-commit-id --name-only -r -m "$COMMIT"
}

require_clean_deploy_worktree() {
  local dirty
  local -a paths=(
    "cloudfunctions"
    "scripts/*-common.template.js"
    "cloudbaserc.json"
    "scripts/deploy-cloudfunctions.sh"
    "scripts/deploy-changed-cloudfunctions.sh"
    "scripts/git-hooks/post-commit-cloud-deploy.sh"
    "scripts/install-cloud-deploy-hook.sh"
  )

  dirty="$(git status --porcelain -- "${paths[@]}")"
  if [ -z "$dirty" ]; then
    return 0
  fi

  echo "Cloud function deployment skipped because deploy-related files are dirty:" >&2
  printf '%s\n' "$dirty" >&2
  echo "Commit or discard these changes before deploying the commit snapshot." >&2
  exit 1
}

resolve_changed_functions() {
  COMMON_CHANGED=false
  SELECTED_FUNCTIONS=()
  declare -gA SELECTED_FUNCTION_SET=()
  declare -gA LIB_CHANGED_FUNCTION_SET=()

  local changed_file
  for changed_file in "${CHANGED_FILES[@]}"; do
    case "$changed_file" in
      scripts/*-common.template.js)
        COMMON_CHANGED=true
        ;;
      cloudfunctions/*/*)
        local function_name="${changed_file#cloudfunctions/}"
        function_name="${function_name%%/*}"

        if ! function_exists "$function_name"; then
          fail "Changed cloud function is not configured in cloudbaserc.json: $function_name"
        fi

        SELECTED_FUNCTION_SET["$function_name"]=1

        case "$changed_file" in
          cloudfunctions/*/lib/*)
            LIB_CHANGED_FUNCTION_SET["$function_name"]=1
            ;;
        esac
        ;;
    esac
  done

  if [ "$COMMON_CHANGED" = true ]; then
    SELECTED_FUNCTIONS=("${FUNCTIONS[@]}")
    return 0
  fi

  local -a blocked_lib_functions=()
  local function_name
  for function_name in "${FUNCTIONS[@]}"; do
    if [ "${LIB_CHANGED_FUNCTION_SET[$function_name]+set}" = set ] && ! lib_change_allowed_for_function "$function_name"; then
      blocked_lib_functions+=("$function_name")
    fi
  done

  if [ "${#blocked_lib_functions[@]}" -gt 0 ]; then
    fail "cloudfunctions/*/lib/* changed without a shared template change: ${blocked_lib_functions[*]}. Update scripts/*-common.template.js and run scripts/sync-cloud-common.sh instead."
  fi

  for function_name in "${FUNCTIONS[@]}"; do
    if [ "${SELECTED_FUNCTION_SET[$function_name]+set}" = set ]; then
      SELECTED_FUNCTIONS+=("$function_name")
    fi
  done
}

print_plan() {
  local source_label="$1"

  echo "Cloud function deploy source: $source_label"

  if [ "${#CHANGED_FILES[@]}" -eq 0 ]; then
    echo "No changed files detected."
    return 0
  fi

  if [ "$COMMON_CHANGED" = true ]; then
    echo "Shared common template changed: deploying all configured cloud functions."
  fi

  if [ "${#SELECTED_FUNCTIONS[@]}" -eq 0 ]; then
    echo "No cloud function changes detected. Skipping deployment."
    return 0
  fi

  echo "Cloud functions to deploy:"
  printf '  %s\n' "${SELECTED_FUNCTIONS[@]}"
}

run_predeploy_checks() {
  if [ "$COMMON_CHANGED" = true ]; then
    echo "Checking cloud shared libraries..."
    if ! bash scripts/check-cloud-common.sh; then
      echo "ERROR: Shared cloud libraries are out of sync." >&2
      echo "Run bash scripts/sync-cloud-common.sh, amend the commit, then retry deployment." >&2
      exit 1
    fi
  fi

  echo "Running project checks before cloud deployment..."
  npm run check
  node --test tests/*.test.js
  timeout 20s tcb env list --json >/dev/null
}

deploy_selected_functions() {
  local function_name

  for function_name in "${SELECTED_FUNCTIONS[@]}"; do
    bash scripts/deploy-cloudfunctions.sh --force "$function_name"
  done
}

COMMIT="HEAD"
COMMIT_EXPLICIT=false
RANGE=""
FILES_FROM=""
DRY_RUN=false
ALLOW_DIRTY=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --commit)
      COMMIT="${2:-}"
      [ -n "$COMMIT" ] || fail "--commit requires a value"
      COMMIT_EXPLICIT=true
      shift 2
      ;;
    --range)
      RANGE="${2:-}"
      [ -n "$RANGE" ] || fail "--range requires a value"
      shift 2
      ;;
    --files-from)
      FILES_FROM="${2:-}"
      [ -n "$FILES_FROM" ] || fail "--files-from requires a value"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY=true
      shift
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

SOURCE_COUNT=0
[ "$COMMIT_EXPLICIT" = true ] && SOURCE_COUNT=$((SOURCE_COUNT + 1))
[ -n "$RANGE" ] && SOURCE_COUNT=$((SOURCE_COUNT + 1))
[ -n "$FILES_FROM" ] && SOURCE_COUNT=$((SOURCE_COUNT + 1))

if [ "$SOURCE_COUNT" -gt 1 ]; then
  fail "Use only one of --commit, --range, or --files-from"
fi

require_config
load_functions

if [ "$DRY_RUN" = false ] && [ "$ALLOW_DIRTY" = false ]; then
  require_clean_deploy_worktree
fi

CHANGED_FILES=()
while IFS= read -r changed_file; do
  if [ -n "$changed_file" ]; then
    CHANGED_FILES+=("$changed_file")
  fi
done < <(read_changed_files)

resolve_changed_functions

if [ -n "$FILES_FROM" ]; then
  SOURCE_LABEL="files-from:$FILES_FROM"
elif [ -n "$RANGE" ]; then
  SOURCE_LABEL="range:$RANGE"
else
  SOURCE_LABEL="commit:$(git rev-parse --short "$COMMIT")"
fi

print_plan "$SOURCE_LABEL"

if [ "${#SELECTED_FUNCTIONS[@]}" -eq 0 ]; then
  exit 0
fi

if [ "$DRY_RUN" = true ]; then
  echo "Dry run only. No checks or deployment executed."
  exit 0
fi

run_predeploy_checks
deploy_selected_functions

echo "Changed cloud functions deployed successfully."
