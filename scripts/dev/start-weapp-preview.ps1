$ErrorActionPreference = 'Stop'

$CliPath = 'D:\Soft\微信web开发者工具\cli.bat'
$PreviewDir = 'D:\projects\badminton-miniapp-preview'
$AutoPort = 9420

function Write-Log {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Write-Host "[$timestamp] $Message"
}

function Resolve-CliPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FallbackPath
    )

    if (Test-Path -LiteralPath $FallbackPath -PathType Leaf) {
        return $FallbackPath
    }

    $candidate = Get-ChildItem -LiteralPath 'D:\Soft' -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like '*web*' } |
        Select-Object -First 1

    if ($candidate) {
        $resolvedPath = Join-Path $candidate.FullName 'cli.bat'
        if (Test-Path -LiteralPath $resolvedPath -PathType Leaf) {
            return $resolvedPath
        }
    }

    return $FallbackPath
}

$CliPath = Resolve-CliPath -FallbackPath $CliPath

if (-not (Test-Path -LiteralPath $CliPath -PathType Leaf)) {
    throw "微信开发者工具 CLI 不存在：$CliPath"
}

if (-not (Test-Path -LiteralPath $PreviewDir -PathType Container)) {
    throw "预览目录不存在，请先运行同步脚本：$PreviewDir"
}

Write-Log "CLI: $CliPath"
Write-Log "PROJECT: $PreviewDir"
Write-Log "PORT: $AutoPort"
Write-Log "启动微信开发者工具 auto 模式"

& $CliPath auto --project $PreviewDir --auto-port $AutoPort
exit $LASTEXITCODE
