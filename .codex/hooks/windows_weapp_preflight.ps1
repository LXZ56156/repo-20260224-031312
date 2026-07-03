$ErrorActionPreference = 'Stop'

$Launcher = if ($env:WEAPP_PREFLIGHT_LAUNCHER) {
  $env:WEAPP_PREFLIGHT_LAUNCHER
} else {
  'D:\weapp-mcp-launcher\weapp-main-dev.cmd'
}

$Port = if ($env:WEAPP_PREFLIGHT_PORT) {
  [int]$env:WEAPP_PREFLIGHT_PORT
} else {
  39420
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
    return $true
  }

  $haystack = $Payload.ToLowerInvariant()
  foreach ($keyword in $Keywords) {
    if ($haystack.Contains($keyword.ToLowerInvariant())) {
      return $true
    }
  }
  return $false
}

function Test-Port {
  param([int]$Port)

  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(1000) -and $client.Connected
    $client.Close()
    return $ok
  } catch {
    return $false
  }
}

$payload = Read-StandardInput
if (-not (Test-WeappPrompt -Payload $payload)) {
  Write-Host 'No weapp-related prompt detected; skip Windows DevTools preflight.'
  exit 0
}

if (-not (Test-Port -Port $Port)) {
  if (-not (Test-Path -LiteralPath $Launcher -PathType Leaf)) {
    throw "Windows main DevTools launcher not found: $Launcher"
  }
  & $Launcher | Out-Host
}

if (-not (Test-Port -Port $Port)) {
  throw "WeChat DevTools automation port is unavailable: ws://127.0.0.1:$Port"
}

Write-Host "Windows WeChat DevTools automation ready: ws://127.0.0.1:$Port"
exit 0
