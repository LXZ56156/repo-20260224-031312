# PowerShell 部署脚本 — 固定上传 Windows 镜像项目
# 用法: .\scripts\deploy-preview.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = [IO.Path]::GetFullPath((Join-Path -Path $PSScriptRoot -ChildPath '..'))

# 环境变量（按需修改）
if (-not $env:MP_PROJECT_PATH) {
    $env:MP_PROJECT_PATH = if ($env:WEAPP_PREVIEW_DIR) {
        $env:WEAPP_PREVIEW_DIR
    } else {
        Join-Path -Path (Split-Path -Parent $RepoRoot) -ChildPath 'badminton-miniapp-preview'
    }
}
if (-not $env:MP_ROBOT) {
    $env:MP_ROBOT = "1"
}
if (-not $env:MP_DESC) {
    $env:MP_DESC = "Windows 镜像项目自动上传"
}

Write-Host "=== 小程序 CI 上传 ===" -ForegroundColor Cyan
Write-Host "项目路径: $env:MP_PROJECT_PATH"
Write-Host "AppID: $env:WX_APPID"
Write-Host "机器人: $env:MP_ROBOT"
Write-Host "备注: $env:MP_DESC"
Write-Host ""

& node (Join-Path -Path $RepoRoot -ChildPath 'scripts\mp-ci.js') validate-preview-manifest
if ($LASTEXITCODE -ne 0) {
    throw "Preview sync manifest validation failed; upload was not started."
}

npm run mp:upload
