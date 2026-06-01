#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# deploy-cloud.sh — 非交互式部署全部云函数
# =============================================================================
#
# 使用腾讯云 CAM 子账号 SecretId/SecretKey 进行非交互式登录，
# 无需扫码或浏览器授权，适合 CI/CD 和日常开发。
#
# 环境变量：
#   TENCENTCLOUD_SECRETID    腾讯云 API SecretId（必填）
#   TENCENTCLOUD_SECRETKEY   腾讯云 API SecretKey（必填）
#   CLOUDBASE_ENV_ID         CloudBase 环境 ID（可选，默认读取 cloudbaserc.json）
#
# 用法：
#   TENCENTCLOUD_SECRETID=xxx TENCENTCLOUD_SECRETKEY=xxx bash scripts/deploy-cloud.sh
#   TENCENTCLOUD_SECRETID=xxx TENCENTCLOUD_SECRETKEY=xxx bash scripts/deploy-cloud.sh --force
#   npm run deploy
#
# 前置准备（仅需一次）：
#   1. 前往 https://console.cloud.tencent.com/cam/capi 创建子账号密钥
#   2. 将 SecretId 和 SecretKey 写入 ~/.bashrc 或 ~/.zshrc：
#      export TENCENTCLOUD_SECRETID="AKIDxxxxx"
#      export TENCENTCLOUD_SECRETKEY="xxxxx"
#   3. source ~/.bashrc 后即可直接运行 npm run deploy
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/cloudbaserc.json"
DEPLOY_SCRIPT="$SCRIPT_DIR/deploy-cloudfunctions.sh"

# ---- helpers ----

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

# ---- credential check ----

check_credentials() {
  if [ -z "${TENCENTCLOUD_SECRETID:-}" ]; then
    cat >&2 <<'EOF'
ERROR: 缺少 TENCENTCLOUD_SECRETID 环境变量。

请设置腾讯云 API 密钥环境变量：

  export TENCENTCLOUD_SECRETID="AKIDxxxxx"
  export TENCENTCLOUD_SECRETKEY="xxxxx"

获取密钥：
  1. 前往 https://console.cloud.tencent.com/cam/capi
  2. 创建子账号密钥（或使用已有密钥）
  3. 将 SecretId 和 SecretKey 写入 ~/.bashrc，然后 source ~/.bashrc

之后直接运行：
  npm run deploy
EOF
    exit 1
  fi

  if [ -z "${TENCENTCLOUD_SECRETKEY:-}" ]; then
    cat >&2 <<'EOF'
ERROR: 缺少 TENCENTCLOUD_SECRETKEY 环境变量。

请设置腾讯云 API 密钥环境变量：

  export TENCENTCLOUD_SECRETID="AKIDxxxxx"
  export TENCENTCLOUD_SECRETKEY="xxxxx"

之后直接运行：
  npm run deploy
EOF
    exit 1
  fi
}

# ---- login state check ----

is_logged_in() {
  if command -v timeout >/dev/null 2>&1; then
    timeout 15s tcb env list --json >/dev/null 2>&1
  else
    tcb env list --json >/dev/null 2>&1
  fi
}

# ---- non-interactive login ----

ensure_login() {
  if is_logged_in; then
    echo "已登录，跳过登录步骤。"
    return 0
  fi

  if [ -z "${TENCENTCLOUD_SECRETID:-}" ] || [ -z "${TENCENTCLOUD_SECRETKEY:-}" ]; then
    cat >&2 <<'EOF'
ERROR: 未登录且未设置 API 密钥环境变量。

首次使用请设置腾讯云 API 密钥：

  export TENCENTCLOUD_SECRETID="AKIDxxxxx"
  export TENCENTCLOUD_SECRETKEY="xxxxx"

获取密钥：
  1. 前往 https://console.cloud.tencent.com/cam/capi
  2. 将 SecretId 和 SecretKey 写入 ~/.bashrc，然后 source ~/.bashrc

之后直接运行：
  npm run deploy
EOF
    exit 1
  fi

  echo "正在进行非交互式登录..."

  if tcb login --apiKeyId "$TENCENTCLOUD_SECRETID" --apiKey "$TENCENTCLOUD_SECRETKEY"; then
    echo "非交互式登录成功。"
    return 0
  fi

  cat >&2 <<'EOF'
ERROR: 非交互式登录失败。

可能原因：
  1. SecretId / SecretKey 不正确或已过期
  2. 子账号没有被授予 CloudBase 相关权限
  3. 网络无法访问腾讯云 API

排查步骤：
  1. 前往 https://console.cloud.tencent.com/cam/capi 确认密钥状态
  2. 确认子账号已关联 QcloudTCBFullAccess 策略
EOF
  exit 1
}

# ---- main ----

main() {
  if [ ! -f "$DEPLOY_SCRIPT" ]; then
    fail "部署脚本不存在: $DEPLOY_SCRIPT"
  fi

  ensure_login

  echo ""
  echo "===== 开始部署全部云函数 ====="
  echo "环境 ID: ${CLOUDBASE_ENV_ID:-(读取自 cloudbaserc.json)}"
  echo ""

  # 转发所有参数给 deploy-cloudfunctions.sh
  # 默认行为：部署全部云函数（--all）
  if [ "$#" -eq 0 ]; then
    bash "$DEPLOY_SCRIPT" --all
  else
    bash "$DEPLOY_SCRIPT" "$@"
  fi
}

main "$@"
