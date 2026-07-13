[CmdletBinding()]
param(
    [switch]$Audit,
    [switch]$ForceRestart,
    [string]$ProjectDir,
    [string]$CliPath,
    [string]$WsEndpoint,
    [int]$CliPort = 39421
)

$ErrorActionPreference = 'Stop'
$startedAt = [Diagnostics.Stopwatch]::StartNew()
$repoRoot = [IO.Path]::GetFullPath((Join-Path -Path $PSScriptRoot -ChildPath '..\..'))
. (Join-Path -Path $PSScriptRoot -ChildPath 'weapp-powershell-common.ps1')

if ([string]::IsNullOrWhiteSpace($ProjectDir)) { $ProjectDir = $repoRoot }
if ([string]::IsNullOrWhiteSpace($CliPath)) { $CliPath = $env:WEAPP_DEVTOOLS_CLI }
if ([string]::IsNullOrWhiteSpace($WsEndpoint)) {
    $WsEndpoint = if ($env:WEAPP_WS_ENDPOINT) { $env:WEAPP_WS_ENDPOINT } else { 'ws://127.0.0.1:39420' }
}

$ProjectDir = [IO.Path]::GetFullPath($ProjectDir)
$CliPath = Resolve-WeappCliPath -RequestedPath $CliPath
$autoPort = [Uri]::new($WsEndpoint).Port
$sessionRecord = Join-Path -Path $ProjectDir -ChildPath 'tmp\weapp-automation-session.json'

Assert-WeappProjectLayout -ProjectDir $ProjectDir -Role source

if ($Audit) {
    [ordered]@{
        schemaVersion = 1
        role = 'source'
        projectDir = $ProjectDir
        sourceDir = $ProjectDir
        cliPath = $CliPath
        wsEndpoint = $WsEndpoint
        cliPort = $CliPort
        autoPort = $autoPort
    } | ConvertTo-Json -Compress
    exit 0
}

function Write-LauncherLog {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
}

$toolInfo = $null
if (-not $ForceRestart -and (Test-WeappSessionRecordMetadata -RecordPath $sessionRecord -ProjectDir $ProjectDir -WsEndpoint $WsEndpoint -Role source -CliPort $CliPort)) {
    try {
        $existingSession = Get-Content -Raw -LiteralPath $sessionRecord | ConvertFrom-Json
        $null = Show-WeappDevToolsWindow -ProcessId ([uint32]$existingSession.mainProcessId) `
            -ProcessCreationDate ([string]$existingSession.mainProcessCreationDate)
        Start-Sleep -Milliseconds 500
        $processIdentity = Wait-WeappSessionProcessIdentity -ExpectedCliPort $CliPort -WsEndpoint $WsEndpoint
        if (-not (Test-WeappSessionRecord -RecordPath $sessionRecord -ProjectDir $ProjectDir -WsEndpoint $WsEndpoint -Role source -CliPort $CliPort -ProcessIdentity $processIdentity)) {
            throw 'DevTools process identity changed while validating the warm session.'
        }
        $runtimeBinding = [string]$existingSession.runtimeBinding
        if (-not (Test-WeappRuntimeBinding -WsEndpoint $WsEndpoint -ExpectedBinding $runtimeBinding)) {
            throw 'AppService runtime binding changed; exact source project rebind is required.'
        }
        $toolInfo = Get-WeappToolInfo -WsEndpoint $WsEndpoint -TimeoutMilliseconds 5000
        $currentPage = Get-WeappCurrentPage -WsEndpoint $WsEndpoint -TimeoutMilliseconds 5000
        $null = Show-WeappDevToolsWindow -ProcessId ([uint32]$processIdentity.MainProcessId) `
            -ProcessCreationDate ([string]$processIdentity.MainProcessCreationDate)
        Write-WeappSessionRecord -RecordPath $sessionRecord -ProjectDir $ProjectDir -WsEndpoint $WsEndpoint -Role source -ToolInfo $toolInfo -ProcessIdentity $processIdentity -RuntimeBinding $runtimeBinding
        $startedAt.Stop()
        Write-LauncherLog "MODE: warm-reuse"
        Write-LauncherLog "PROJECT: $ProjectDir"
        Write-LauncherLog "Tool.getInfo: version=$($toolInfo.version), SDKVersion=$($toolInfo.SDKVersion)"
        Write-LauncherLog "App.getCurrentPage: $($currentPage.path)"
        Write-LauncherLog "READY: $WsEndpoint ($($startedAt.ElapsedMilliseconds)ms)"
        exit 0
    } catch {
        Write-LauncherLog "Existing endpoint is not reusable: $($_.Exception.Message)"
    }
}

Write-LauncherLog 'MODE: cold-start'
Write-LauncherLog "CLI: $CliPath"
Write-LauncherLog "PROJECT: $ProjectDir"
Stop-WeappDevToolsCli -CliPath $CliPath -WorkingDirectory $ProjectDir -ExpectedPort $CliPort
$null = Invoke-WeappCli -CliPath $CliPath -Arguments @(
    'open', '--project', $ProjectDir,
    '--port', [string]$CliPort,
    '--disable-gpu'
) -WorkingDirectory $ProjectDir
Start-Sleep -Seconds 3
$null = Invoke-WeappCli -CliPath $CliPath -Arguments @(
    'auto', '--project', $ProjectDir,
    '--port', [string]$CliPort,
    '--auto-port', [string]$autoPort,
    '--disable-gpu'
) -WorkingDirectory $ProjectDir

$toolInfo = Wait-WeappToolInfo -WsEndpoint $WsEndpoint -TimeoutSeconds 60
$currentPage = Wait-WeappCurrentPage -WsEndpoint $WsEndpoint -TimeoutSeconds 75
$processIdentity = Wait-WeappSessionProcessIdentity -ExpectedCliPort $CliPort -WsEndpoint $WsEndpoint
$runtimeBinding = [Guid]::NewGuid().ToString('N')
$null = Set-WeappRuntimeBinding -WsEndpoint $WsEndpoint -Binding $runtimeBinding
$null = Show-WeappDevToolsWindow -ProcessId ([uint32]$processIdentity.MainProcessId) `
    -ProcessCreationDate ([string]$processIdentity.MainProcessCreationDate)
Start-Sleep -Seconds 1
Write-WeappSessionRecord -RecordPath $sessionRecord -ProjectDir $ProjectDir -WsEndpoint $WsEndpoint -Role source -ToolInfo $toolInfo -ProcessIdentity $processIdentity -RuntimeBinding $runtimeBinding
$startedAt.Stop()
Write-LauncherLog "Tool.getInfo: version=$($toolInfo.version), SDKVersion=$($toolInfo.SDKVersion)"
Write-LauncherLog "App.getCurrentPage: $($currentPage.path)"
Write-LauncherLog "READY: $WsEndpoint ($($startedAt.ElapsedMilliseconds)ms)"
exit 0
