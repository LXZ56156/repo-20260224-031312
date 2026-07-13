[CmdletBinding()]
param(
    [string]$WsEndpoint,
    [int]$TimeoutMilliseconds = 5000,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
. (Join-Path -Path $PSScriptRoot -ChildPath 'weapp-powershell-common.ps1')
if ([string]::IsNullOrWhiteSpace($WsEndpoint)) {
    $WsEndpoint = if ($env:WEAPP_WS_ENDPOINT) { $env:WEAPP_WS_ENDPOINT } else { 'ws://127.0.0.1:39420' }
}

$startedAt = [Diagnostics.Stopwatch]::StartNew()
$toolInfo = Get-WeappToolInfo -WsEndpoint $WsEndpoint -TimeoutMilliseconds $TimeoutMilliseconds
$currentPage = Get-WeappCurrentPage -WsEndpoint $WsEndpoint -TimeoutMilliseconds $TimeoutMilliseconds
$startedAt.Stop()
$payload = [ordered]@{
    ok = $true
    wsEndpoint = $WsEndpoint
    version = [string]$toolInfo.version
    SDKVersion = [string]$toolInfo.SDKVersion
    currentPage = [string]$currentPage.path
    durationMs = $startedAt.ElapsedMilliseconds
}
if ($Json) {
    $payload | ConvertTo-Json -Compress
} else {
    Write-Host "Automation OK: $WsEndpoint version=$($payload.version) SDKVersion=$($payload.SDKVersion) currentPage=$($payload.currentPage) durationMs=$($payload.durationMs)"
}
exit 0
