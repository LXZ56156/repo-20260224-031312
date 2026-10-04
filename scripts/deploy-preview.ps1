# PowerShell 上传入口 — 默认使用脚本所在 Git 源码工作区
# 用法: .\scripts\deploy-preview.ps1

$ErrorActionPreference = "Stop"

# 环境变量（按需修改）
if (-not $env:MP_PROJECT_PATH) {
    $env:MP_PROJECT_PATH = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
}
if (-not $env:MP_ROBOT) {
    $env:MP_ROBOT = "1"
}
if (-not $env:MP_DESC) {
    $env:MP_DESC = "Git 源码工作区自动上传"
}

Write-Host "=== 小程序 CI 上传 ===" -ForegroundColor Cyan
Write-Host "项目路径: $env:MP_PROJECT_PATH"
Write-Host "AppID: $env:WX_APPID"
Write-Host "机器人: $env:MP_ROBOT"
Write-Host "备注: $env:MP_DESC"
Write-Host ""

npm run mp:upload
