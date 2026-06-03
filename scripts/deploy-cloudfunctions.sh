#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/cloudbaserc.json"

cd "$PROJECT_ROOT"

print_help() {
  cat <<'EOF'
Usage:
  bash scripts/deploy-cloudfunctions.sh --all
  bash scripts/deploy-cloudfunctions.sh <functionName>
  bash scripts/deploy-cloudfunctions.sh --force <functionName>
  bash scripts/deploy-cloudfunctions.sh --help

Options:
  --all       Deploy every cloud function listed in cloudbaserc.json.
  --force     Overwrite an existing cloud function without an interactive prompt.
  --no-verify Skip post-deploy function detail verification.
  --help      Show this help message.

Examples:
  npm run deploy:cloud:all
  npm run deploy:cloud -- startTournament
  bash scripts/deploy-cloudfunctions.sh --force startTournament
  bash scripts/deploy-cloudfunctions.sh startTournament

Notes:
  The script checks that tcb is installed, cloudbaserc.json exists, and tcb is logged in.
  Node.js functions with package dependencies must declare installDependency: true.
  It deploys functions one by one so a batch failure can report the failed function name.
  If the installed CloudBase CLI supports --yes for fn deploy, the script adds it automatically.
EOF
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_tcb() {
  if ! command -v tcb >/dev/null 2>&1; then
    fail "CloudBase CLI is not installed. Install it with: npm install -g @cloudbase/cli"
  fi
}

require_config() {
  if [ ! -f "$CONFIG_FILE" ]; then
    fail "cloudbaserc.json not found at project root: $CONFIG_FILE"
  fi
}

read_function_root() {
  node - "$CONFIG_FILE" <<'NODE'
const fs = require('node:fs')

const configPath = process.argv[2]
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
console.log(config.functionRoot || './cloudfunctions')
NODE
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

load_config() {
  FUNCTION_ROOT="$(read_function_root)"
  if [ ! -d "$FUNCTION_ROOT" ]; then
    fail "Configured functionRoot does not exist: $FUNCTION_ROOT"
  fi

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

require_function_dir() {
  local function_name="$1"
  local function_dir="${FUNCTION_ROOT%/}/$function_name"

  if [ ! -d "$function_dir" ]; then
    fail "Configured function directory does not exist: $function_dir"
  fi
}

require_dependency_install_config() {
  local function_name="$1"
  local function_dir="${FUNCTION_ROOT%/}/$function_name"
  local package_json="$function_dir/package.json"

  if ! node - "$CONFIG_FILE" "$function_name" "$package_json" <<'NODE'
const fs = require('node:fs')

const [configPath, functionName, packagePath] = process.argv.slice(2)
if (!fs.existsSync(packagePath)) {
  console.error(`Cloud function package.json not found: ${packagePath}`)
  process.exit(1)
}

let config
let packageJson
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
} catch (error) {
  console.error(`Failed to read cloud dependency config for ${functionName}: ${error.message}`)
  process.exit(1)
}

const functions = Array.isArray(config.functions) ? config.functions : []
const functionConfig = functions.find((item) => {
  if (typeof item === 'string') return item === functionName
  return item && item.name === functionName
})
if (!functionConfig) {
  console.error(`Cloud function is not configured: ${functionName}`)
  process.exit(1)
}

const dependencies = packageJson && typeof packageJson.dependencies === 'object'
  ? Object.keys(packageJson.dependencies)
  : []
if (dependencies.length > 0 && functionConfig.installDependency !== true) {
  console.error(`Cloud function ${functionName} declares dependencies but installDependency is not true`)
  process.exit(1)
}
NODE
  then
    fail "Cloud dependency configuration is invalid for: $function_name"
  fi
}

require_login() {
  local status

  set +e
  if command -v timeout >/dev/null 2>&1; then
    timeout 15s tcb env list --json >/dev/null 2>&1
    status=$?
  else
    tcb env list --json >/dev/null 2>&1
    status=$?
  fi
  set -e

  if [ "$status" -eq 0 ]; then
    return 0
  fi

  if [ "$status" -eq 124 ]; then
    echo "CloudBase CLI login check timed out." >&2
  else
    echo "CloudBase CLI is not logged in." >&2
  fi

  echo "Please run:" >&2
  echo "  tcb login" >&2
  echo "Then run:" >&2
  echo "  npm run deploy:cloud:all" >&2
  exit 1
}

detect_deploy_flags() {
  local deploy_help

  deploy_help="$(tcb fn deploy --help 2>/dev/null || true)"

  if printf '%s' "$deploy_help" | grep -q -- '--yes'; then
    YES_FLAG=(--yes)
  else
    YES_FLAG=()
  fi

  if [ "$FORCE_DEPLOY" = true ]; then
    if printf '%s' "$deploy_help" | grep -q -- '--force'; then
      FORCE_FLAG=(--force)
    else
      fail "Installed CloudBase CLI does not support tcb fn deploy --force"
    fi
  else
    FORCE_FLAG=()
  fi
}

verify_one() {
  local function_name="$1"
  local detail_output
  local verify_output
  local verify_status
  local attempt=1
  local verify_attempts="${CLOUD_DEPLOY_VERIFY_ATTEMPTS:-60}"
  local verify_sleep_seconds="${CLOUD_DEPLOY_VERIFY_SLEEP_SECONDS:-2}"

  echo "Verifying cloud function: $function_name"

  while [ "$attempt" -le "$verify_attempts" ]; do
    if ! detail_output="$(tcb fn detail "$function_name" --json 2>&1)"; then
      echo "$detail_output" >&2
      echo "ERROR: Verification failed for cloud function: $function_name" >&2
      exit 1
    fi

    set +e
    verify_output="$(printf '%s\n' "$detail_output" | FUNCTION_NAME="$function_name" node -e '
const fn = process.env.FUNCTION_NAME;
let input = "";

process.stdin.on("data", (chunk) => {
  input += chunk;
});

process.stdin.on("end", () => {
  const jsonStart = input.indexOf("{");
  if (jsonStart < 0) {
    console.error(`ERROR: Verification output for ${fn} did not contain JSON`);
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(input.slice(jsonStart));
  } catch (error) {
    console.error(`ERROR: Could not parse verification output for ${fn}: ${error.message}`);
    process.exit(1);
  }

  const data = payload.data || payload.Data || {};
  const status = data.Status || data.status || "";
  const availableStatus = data.AvailableStatus || data.availableStatus || "";
  const installDependency = data.InstallDependency ?? data.installDependency;

  if (
    status !== "Active"
    || availableStatus !== "Available"
    || (installDependency !== "TRUE" && installDependency !== true)
  ) {
    console.log(`Waiting for cloud function: ${fn} (${status || "unknown"}/${availableStatus || "unknown"}, installDependency=${installDependency ?? "unknown"})`);
    process.exit(2);
  }

  console.log(`Verified cloud function: ${fn} (${status}/${availableStatus}, installDependency=TRUE)`);
});
')"
    verify_status=$?
    set -e

    if [ "$verify_status" -eq 0 ]; then
      echo "$verify_output"
      return 0
    fi

    if [ "$verify_status" -ne 2 ]; then
      echo "$verify_output" >&2
      echo "ERROR: Verification failed for cloud function: $function_name" >&2
      exit 1
    fi

    echo "$verify_output"
    sleep "$verify_sleep_seconds"
    attempt=$((attempt + 1))
  done

  if [ "$attempt" -gt "$verify_attempts" ]; then
    echo "ERROR: Verification failed for cloud function: $function_name" >&2
    exit 1
  fi
}

deploy_one() {
  local function_name="$1"

  require_function_dir "$function_name"
  require_dependency_install_config "$function_name"
  echo "Deploying cloud function: $function_name"

  if ! tcb fn deploy "$function_name" "${YES_FLAG[@]}" "${FORCE_FLAG[@]}"; then
    echo "ERROR: Deploy failed for cloud function: $function_name" >&2
    exit 1
  fi

  if [ "$VERIFY_DEPLOY" = true ]; then
    verify_one "$function_name"
  fi
}

main() {
  DEPLOY_ALL=false
  FORCE_DEPLOY=false
  VERIFY_DEPLOY=true
  TARGET_FUNCTION=""

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --all)
        DEPLOY_ALL=true
        shift
        ;;
      --force)
        FORCE_DEPLOY=true
        shift
        ;;
      --no-verify)
        VERIFY_DEPLOY=false
        shift
        ;;
      --help|-h)
        print_help
        exit 0
        ;;
      -*)
        fail "Unknown option: $1"
        ;;
      *)
        if [ -n "$TARGET_FUNCTION" ]; then
          fail "Only one function name can be provided"
        fi
        TARGET_FUNCTION="$1"
        shift
        ;;
    esac
  done

  if [ "$DEPLOY_ALL" = true ] && [ -n "$TARGET_FUNCTION" ]; then
    fail "--all cannot be combined with a function name"
  fi

  if [ "$DEPLOY_ALL" = false ] && [ -z "$TARGET_FUNCTION" ]; then
    print_help
    exit 1
  fi

  require_tcb
  require_config
  load_config
  detect_deploy_flags
  require_login

  if [ "$DEPLOY_ALL" = true ]; then
    local function_name
    for function_name in "${FUNCTIONS[@]}"; do
      deploy_one "$function_name"
    done
    echo "All configured cloud functions deployed successfully."
    exit 0
  fi

  if ! function_exists "$TARGET_FUNCTION"; then
    echo "Configured cloud functions:" >&2
    printf '  %s\n' "${FUNCTIONS[@]}" >&2
    fail "Unknown function in cloudbaserc.json: $TARGET_FUNCTION"
  fi

  deploy_one "$TARGET_FUNCTION"
  echo "Cloud function deployed successfully: $TARGET_FUNCTION"
}

main "$@"
