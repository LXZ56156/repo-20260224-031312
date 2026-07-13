$ErrorActionPreference = 'Stop'
$RepoRoot = [IO.Path]::GetFullPath((Join-Path -Path $PSScriptRoot -ChildPath '..\..'))
. (Join-Path -Path $RepoRoot -ChildPath 'scripts\dev\weapp-powershell-common.ps1')

$Launcher = if ($env:WEAPP_PREFLIGHT_LAUNCHER) {
  $env:WEAPP_PREFLIGHT_LAUNCHER
} else {
  'D:\weapp-mcp-launcher\weapp-main-dev.cmd'
}

$WsEndpoint = if ($env:WEAPP_WS_ENDPOINT) {
  $env:WEAPP_WS_ENDPOINT
} else {
  $port = if ($env:WEAPP_PREFLIGHT_PORT) { [int]$env:WEAPP_PREFLIGHT_PORT } else { 39420 }
  "ws://127.0.0.1:$port"
}

$Keywords = @(
  ([string]::Concat([char]0x5fae, [char]0x4fe1)),
  ([string]::Concat([char]0x5c0f, [char]0x7a0b, [char]0x5e8f)),
  'weapp',
  'devtools',
  ([string]::Concat([char]0x5f00, [char]0x53d1, [char]0x8005, [char]0x5de5, [char]0x5177)),
  ([string]::Concat([char]0x622a, [char]0x56fe)),
  'UI'
)

function Read-StandardInput {
  if ([Console]::IsInputRedirected) {
    return [Console]::In.ReadToEnd()
  }
  return ''
}

function Test-WeappPrompt {
  param([string]$Payload)

  if ($env:WEAPP_PREFLIGHT_FORCE -eq '1') {
    return $true
  }
  if ([string]::IsNullOrWhiteSpace($Payload)) {
    return $false
  }

  $haystack = $Payload.ToLowerInvariant()
  foreach ($keyword in $Keywords) {
    if ($haystack.Contains($keyword.ToLowerInvariant())) {
      return $true
    }
  }
  return $false
}

$payload = Read-StandardInput
if (-not (Test-WeappPrompt -Payload $payload)) {
  Write-Host 'No weapp-related prompt detected; skip Windows DevTools preflight.'
  exit 0
}

if (-not (Test-Path -LiteralPath $Launcher -PathType Leaf)) {
  throw "Windows main DevTools launcher not found: $Launcher"
}
& $Launcher | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Windows main DevTools launcher failed with exit $LASTEXITCODE"
}

$toolInfo = Get-WeappToolInfo -WsEndpoint $WsEndpoint -TimeoutMilliseconds 5000
Write-Host "Windows WeChat DevTools Tool.getInfo ready: $WsEndpoint version=$($toolInfo.version) SDKVersion=$($toolInfo.SDKVersion)"
exit 0
