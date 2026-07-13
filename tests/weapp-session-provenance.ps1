[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$CommonScriptPath,
    [Parameter(Mandatory = $true)][string]$RecordPath,
    [Parameter(Mandatory = $true)][string]$ProjectDir
)

$ErrorActionPreference = 'Stop'
. $CommonScriptPath

$matchingIdentity = [pscustomobject]@{
    MainProcessId = [uint32]100
    MainProcessCreationDate = [DateTimeOffset]'2026-07-12T08:00:00.0000000+00:00'
    CliServerPort = 39421
    CliServerProcessId = [uint32]101
    AutomationPort = 39420
    AutomationProcessId = [uint32]102
}
$runtimeBinding = '0123456789abcdef0123456789abcdef'
$toolInfo = [pscustomobject]@{ version = 'test-tool'; SDKVersion = 'test-sdk' }
Write-WeappSessionRecord -RecordPath $RecordPath -ProjectDir $ProjectDir `
    -WsEndpoint 'ws://127.0.0.1:39420' -Role source -ToolInfo $toolInfo `
    -ProcessIdentity $matchingIdentity -RuntimeBinding $runtimeBinding

$script:MockSessionIdentity = $matchingIdentity
function Get-WeappSessionProcessIdentity {
    param([int]$ExpectedCliPort, [string]$WsEndpoint)
    return $script:MockSessionIdentity
}

$recordMatches = Test-WeappSessionRecord -RecordPath $RecordPath -ProjectDir $ProjectDir `
    -WsEndpoint 'ws://127.0.0.1:39420' -Role source -CliPort 39421
$writtenRecord = Get-Content -Raw -LiteralPath $RecordPath | ConvertFrom-Json
$creationTimestampNormalized = [string]$writtenRecord.mainProcessCreationDate -eq '2026-07-12T08:00:00.0000000+00:00'
$runtimeBindingRecorded = [string]$writtenRecord.runtimeBinding -eq $runtimeBinding
$script:MockRuntimeBinding = $runtimeBinding
function Get-WeappRuntimeBinding {
    param([string]$WsEndpoint, [int]$TimeoutMilliseconds)
    return $script:MockRuntimeBinding
}
$runtimeBindingMatches = Test-WeappRuntimeBinding -WsEndpoint 'ws://127.0.0.1:39420' `
    -ExpectedBinding $runtimeBinding
$script:MockRuntimeBinding = 'fedcba9876543210fedcba9876543210'
$runtimeBindingMismatchRejected = -not (Test-WeappRuntimeBinding -WsEndpoint 'ws://127.0.0.1:39420' `
    -ExpectedBinding $runtimeBinding)
$script:MockSessionIdentity = [pscustomobject]@{
    MainProcessId = [uint32]999
    MainProcessCreationDate = $matchingIdentity.MainProcessCreationDate
    CliServerPort = 39421
    AutomationPort = 39420
}
$pidMismatchRejected = -not (Test-WeappSessionRecord -RecordPath $RecordPath -ProjectDir $ProjectDir `
    -WsEndpoint 'ws://127.0.0.1:39420' -Role source -CliPort 39421)
$script:MockSessionIdentity = [pscustomobject]@{
    MainProcessId = [uint32]100
    MainProcessCreationDate = '2026-07-12T08:00:01.0000000+00:00'
    CliServerPort = 39421
    AutomationPort = 39420
}
$creationMismatchRejected = -not (Test-WeappSessionRecord -RecordPath $RecordPath -ProjectDir $ProjectDir `
    -WsEndpoint 'ws://127.0.0.1:39420' -Role source -CliPort 39421)
$script:MockSessionIdentity = $matchingIdentity
$cliPortMismatchRejected = -not (Test-WeappSessionRecord -RecordPath $RecordPath -ProjectDir $ProjectDir `
    -WsEndpoint 'ws://127.0.0.1:39420' -Role source -CliPort 39422)

$record = Get-Content -Raw -LiteralPath $RecordPath | ConvertFrom-Json
$record.verifiedAt = [DateTime]::UtcNow.AddHours(-1).ToString('o')
$record | ConvertTo-Json | Set-Content -LiteralPath $RecordPath -Encoding UTF8
$staleRecordRejected = -not (Test-WeappSessionRecord -RecordPath $RecordPath -ProjectDir $ProjectDir `
    -WsEndpoint 'ws://127.0.0.1:39420' -Role source -CliPort 39421 -MaxRecordAgeMinutes 5)

$script:DiscoveryMode = 'exact'
function Get-WeappDevToolsProcesses {
    $declaredCliPort = if ($script:DiscoveryMode -eq 'wrong-declared') { 21043 } else { 39421 }
    $processes = @(
        [pscustomobject]@{ ProcessId = [uint32]100; ParentProcessId = [uint32]0; CreationDate = [DateTimeOffset]'2026-07-12T08:00:00Z'; CommandLine = "wechatdevtools.exe --cli --ide-http-port $declaredCliPort" },
        [pscustomobject]@{ ProcessId = [uint32]101; ParentProcessId = [uint32]100; CreationDate = [DateTimeOffset]'2026-07-12T08:00:01Z'; CommandLine = 'wechatdevtools.exe --type=renderer' }
    )
    if ($script:DiscoveryMode -eq 'ambiguous') {
        $processes += @(
            [pscustomobject]@{ ProcessId = [uint32]200; ParentProcessId = [uint32]0; CreationDate = [DateTimeOffset]'2026-07-12T09:00:00Z'; CommandLine = 'wechatdevtools.exe --cli --ide-http-port 39421' },
            [pscustomobject]@{ ProcessId = [uint32]201; ParentProcessId = [uint32]200; CreationDate = [DateTimeOffset]'2026-07-12T09:00:01Z'; CommandLine = 'wechatdevtools.exe --type=renderer' }
        )
    }
    return $processes
}
function Get-NetTCPConnection {
    param([string]$State, [uint16[]]$LocalPort, $ErrorAction)
    if ($script:DiscoveryMode -eq 'no-exact') {
        return @([pscustomobject]@{ LocalAddress = '127.0.0.1'; LocalPort = 21043; OwningProcess = [uint32]101 })
    }
    $connections = @(
        [pscustomobject]@{ LocalAddress = '127.0.0.1'; LocalPort = 21043; OwningProcess = [uint32]101 },
        [pscustomobject]@{ LocalAddress = '127.0.0.1'; LocalPort = 39421; OwningProcess = [uint32]101 }
    )
    if ($script:DiscoveryMode -eq 'ambiguous') {
        $connections += [pscustomobject]@{ LocalAddress = '::1'; LocalPort = 39421; OwningProcess = [uint32]201 }
    }
    return $connections
}
function Test-WeappCliHttpPort {
    param([int]$Port)
    return $true
}

$exactIdentity = Get-WeappCliServerIdentity -ExpectedPort 39421
$script:DiscoveryMode = 'no-exact'
$noExactRejected = $null -eq (Get-WeappCliServerIdentity -ExpectedPort 39421)
$script:DiscoveryMode = 'ambiguous'
$ambiguousRejected = $null -eq (Get-WeappCliServerIdentity -ExpectedPort 39421)
$script:DiscoveryMode = 'wrong-declared'
$wrongDeclaredPortRejected = $null -eq (Get-WeappCliServerIdentity -ExpectedPort 39421)

$script:DiscoveryMode = 'ambiguous'
$allProcesses = @(Get-WeappDevToolsProcesses)
$targetSnapshot = @(Get-WeappProcessTreeSnapshot -MainProcessId 100 -Processes $allProcesses)
$otherProcesses = @($allProcesses | Where-Object { [uint32]$_.ProcessId -in @([uint32]200, [uint32]201) })
$targetStillRunning = @($otherProcesses) + @(
    [pscustomobject]@{ ProcessId = [uint32]101; ParentProcessId = [uint32]100; CreationDate = [DateTimeOffset]'2026-07-12T08:00:01Z'; CommandLine = 'wechatdevtools.exe --type=renderer' }
)
$pidReused = @($otherProcesses) + @(
    [pscustomobject]@{ ProcessId = [uint32]101; ParentProcessId = [uint32]999; CreationDate = [DateTimeOffset]'2026-07-12T10:00:01Z'; CommandLine = 'wechatdevtools.exe --type=renderer' }
)

[ordered]@{
    schemaVersion = [int](Get-Content -Raw -LiteralPath $RecordPath | ConvertFrom-Json).schemaVersion
    recordMatches = [bool]$recordMatches
    creationTimestampNormalized = [bool]$creationTimestampNormalized
    runtimeBindingRecorded = [bool]$runtimeBindingRecorded
    runtimeBindingMatches = [bool]$runtimeBindingMatches
    runtimeBindingMismatchRejected = [bool]$runtimeBindingMismatchRejected
    pidMismatchRejected = [bool]$pidMismatchRejected
    creationMismatchRejected = [bool]$creationMismatchRejected
    cliPortMismatchRejected = [bool]$cliPortMismatchRejected
    staleRecordRejected = [bool]$staleRecordRejected
    exactCliPort = [int]$exactIdentity.CliServerPort
    exactMainPid = [uint32]$exactIdentity.MainProcessId
    noExactRejected = [bool]$noExactRejected
    ambiguousRejected = [bool]$ambiguousRejected
    wrongDeclaredPortRejected = [bool]$wrongDeclaredPortRejected
    targetSnapshotPids = @($targetSnapshot | ForEach-Object { [uint32]$_.ProcessId })
    otherInstanceExcluded = [bool](-not (@($targetSnapshot | Where-Object { [uint32]$_.ProcessId -in @([uint32]200, [uint32]201) }).Count))
    otherInstanceDoesNotBlockExit = [bool](Test-WeappProcessTreeExited -Snapshot $targetSnapshot -CurrentProcesses $otherProcesses)
    targetStillRunningRejected = [bool](-not (Test-WeappProcessTreeExited -Snapshot $targetSnapshot -CurrentProcesses $targetStillRunning))
    pidReuseDoesNotBlockExit = [bool](Test-WeappProcessTreeExited -Snapshot $targetSnapshot -CurrentProcesses $pidReused)
} | ConvertTo-Json -Compress
