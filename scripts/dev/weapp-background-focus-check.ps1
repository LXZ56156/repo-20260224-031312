param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Cases
)

$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WeappForegroundProbe {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@

function Get-NormalizedPath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
  return [IO.Path]::GetFullPath($Value).TrimEnd('\').ToLowerInvariant()
}

function Resolve-RepoRelativePath([string]$RepoRoot, [string]$Value, [string]$DefaultRelative) {
  $selected = if ([string]::IsNullOrWhiteSpace($Value)) { $DefaultRelative } else { $Value }
  if ([IO.Path]::IsPathRooted($selected)) { return [IO.Path]::GetFullPath($selected) }
  return [IO.Path]::GetFullPath((Join-Path $RepoRoot $selected))
}

function Read-Utf8JsonFile([string]$Path) {
  $utf8 = [Text.UTF8Encoding]::new($false, $true)
  return [IO.File]::ReadAllText($Path, $utf8) | ConvertFrom-Json
}

function Get-ForegroundProcessId {
  $window = [WeappForegroundProbe]::GetForegroundWindow()
  if ($window -eq [IntPtr]::Zero) { return 0 }
  [uint32]$processId = 0
  [void][WeappForegroundProbe]::GetWindowThreadProcessId($window, [ref]$processId)
  return [int]$processId
}

function Resolve-TargetDevToolsProcess(
  [int]$CandidateProcessId,
  [int]$AnchorProcessId,
  [string]$AnchorStartFileTimeUtc,
  [string]$CliRoot,
  [Collections.Generic.HashSet[int]]$ObservedTargetProcessIds
) {
  if ($CandidateProcessId -le 0) {
    return [pscustomobject]@{ state = 'unknown'; reason = 'no-foreground-process'; processId = $CandidateProcessId }
  }
  try {
    $candidate = Get-Process -Id $CandidateProcessId -ErrorAction Stop
    if ($CandidateProcessId -eq $AnchorProcessId `
        -and [string]$candidate.StartTime.ToFileTimeUtc() -ne $AnchorStartFileTimeUtc) {
      return [pscustomobject]@{ state = 'unknown'; reason = 'anchor-pid-reused'; processId = $CandidateProcessId }
    }
    $candidatePath = Get-NormalizedPath ([string]$candidate.Path)
    if (-not $candidatePath) {
      return [pscustomobject]@{ state = 'unknown'; reason = 'foreground-executable-unavailable'; processId = $CandidateProcessId }
    }
    if ($candidatePath -eq $CliRoot -or $candidatePath.StartsWith("$CliRoot\")) {
      [void]$ObservedTargetProcessIds.Add($CandidateProcessId)
      return [pscustomobject]@{ state = 'target'; reason = 'devtools-install-root'; processId = $CandidateProcessId }
    }
    return [pscustomobject]@{
      state = 'non-target'
      reason = 'verified-executable-outside-devtools-root'
      processId = $CandidateProcessId
    }
  } catch {
    return [pscustomobject]@{ state = 'unknown'; reason = 'foreground-process-query-failed'; processId = $CandidateProcessId; error = $_.Exception.Message }
  }
}

function Get-CachedForegroundClassification(
  [int]$CandidateProcessId,
  [int]$AnchorProcessId,
  [string]$AnchorStartFileTimeUtc,
  [string]$CliRoot,
  [hashtable]$Cache,
  [Collections.Generic.HashSet[int]]$ObservedTargetProcessIds
) {
  if ($CandidateProcessId -le 0) {
    return [pscustomobject]@{ state = 'unknown'; reason = 'no-foreground-process'; processId = $CandidateProcessId }
  }
  try {
    $candidate = Get-Process -Id $CandidateProcessId -ErrorAction Stop
    $cacheKey = "{0}:{1}" -f $CandidateProcessId, $candidate.StartTime.ToFileTimeUtc()
  } catch {
    return [pscustomobject]@{ state = 'unknown'; reason = 'foreground-process-query-failed'; processId = $CandidateProcessId; error = $_.Exception.Message }
  }
  if ($Cache.ContainsKey($cacheKey)) { return $Cache[$cacheKey] }
  $classification = Resolve-TargetDevToolsProcess `
    $CandidateProcessId `
    $AnchorProcessId `
    $AnchorStartFileTimeUtc `
    $CliRoot `
    $ObservedTargetProcessIds
  if ($classification.state -ne 'unknown') { $Cache[$cacheKey] = $classification }
  return $classification
}

function Write-SessionPoison(
  [string]$PoisonFile,
  [object]$Value
) {
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($PoisonFile)) | Out-Null
  $candidate = "$PoisonFile.$PID.$([Guid]::NewGuid().ToString('N')).candidate"
  try {
    [IO.File]::WriteAllText(
      $candidate,
      (($Value | ConvertTo-Json -Depth 8) + [Environment]::NewLine),
      [Text.UTF8Encoding]::new($false)
    )
    Move-Item -LiteralPath $candidate -Destination $PoisonFile -Force
    if (-not (Test-Path -LiteralPath $PoisonFile -PathType Leaf)) {
      throw 'Session poison marker is missing after publication.'
    }
    $written = Read-Utf8JsonFile $PoisonFile
    $verified = (
      [string]$written.kind -eq 'weapp-ui-session-poison-v1' `
      -and [string]$written.sessionId -eq [string]$Value.sessionId `
      -and [string]$written.listenerIdentityHash -eq [string]$Value.listenerIdentityHash `
      -and [string]$written.focusProbeId -eq [string]$Value.focusProbeId `
      -and [string]$written.captureRunId -eq [string]$Value.captureRunId `
      -and [int]$written.childProcessId -eq [int]$Value.childProcessId `
      -and $written.fixtureStateUnknown -eq $true
    )
    if (-not $verified) { throw 'Session poison marker failed post-write identity verification.' }
    return $true
  } finally {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      Remove-Item -LiteralPath $candidate -Force -ErrorAction SilentlyContinue
    }
  }
}

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$sessionFile = Resolve-RepoRelativePath $repoRoot $env:WEAPP_UI_SESSION_FILE 'tmp\weapp-ui-background-session.json'
$poisonFile = "$sessionFile.poisoned.json"
$recoveryFile = "$sessionFile.recovering.json"
if (Test-Path -LiteralPath $recoveryFile -PathType Leaf) {
  throw "Screenshot session has an incomplete stale-lock recovery: $recoveryFile. Run a new npm run ui:prewarm."
}
if (Test-Path -LiteralPath $poisonFile -PathType Leaf) {
  throw "Screenshot session is poisoned after an interrupted capture: $poisonFile. Run a new npm run ui:prewarm on an unused port."
}
if (-not (Test-Path -LiteralPath $sessionFile -PathType Leaf)) {
  throw "Launch-signed screenshot session is missing: $sessionFile. Run npm run ui:prewarm first."
}
$session = Read-Utf8JsonFile $sessionFile
if ($session.kind -ne 'weapp-ui-launch-session-v2') {
  throw "Unsupported screenshot session kind: $($session.kind)"
}

$sampleIntervalMs = if ($env:WEAPP_FOCUS_SAMPLE_MS) { [int]$env:WEAPP_FOCUS_SAMPLE_MS } else { 30 }
if ($sampleIntervalMs -lt 20 -or $sampleIntervalMs -gt 50) {
  throw 'WEAPP_FOCUS_SAMPLE_MS must be between 20 and 50 milliseconds.'
}
$timeoutMs = if ($env:WEAPP_FOCUS_TIMEOUT_MS) { [int]$env:WEAPP_FOCUS_TIMEOUT_MS } else { 300000 }
if ($timeoutMs -lt 30000 -or $timeoutMs -gt 900000) {
  throw 'WEAPP_FOCUS_TIMEOUT_MS must be between 30000 and 900000 milliseconds.'
}
$requestedCases = @($Cases | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
if ($requestedCases.Count -eq 0) { $requestedCases = @('launch') }
if ($requestedCases.Count -ne 1) {
  throw 'Focus acceptance is intentionally limited to exactly one screenshot case per run.'
}
foreach ($caseName in $requestedCases) {
  if ($caseName -notmatch '^[A-Za-z0-9]+$') { throw "Invalid screenshot case name: $caseName" }
}
$maxSampleGapMs = if ($env:WEAPP_FOCUS_MAX_GAP_MS) {
  [double]$env:WEAPP_FOCUS_MAX_GAP_MS
} else {
  [double](($sampleIntervalMs * 2) + 50)
}
if ($maxSampleGapMs -lt 80 -or $maxSampleGapMs -gt 1000) {
  throw 'WEAPP_FOCUS_MAX_GAP_MS must be between 80 and 1000 milliseconds.'
}
$killGraceMs = if ($env:WEAPP_FOCUS_KILL_GRACE_MS) { [int]$env:WEAPP_FOCUS_KILL_GRACE_MS } else { 5000 }
if ($killGraceMs -lt 1000 -or $killGraceMs -gt 30000) {
  throw 'WEAPP_FOCUS_KILL_GRACE_MS must be between 1000 and 30000 milliseconds.'
}

$cliRoot = Get-NormalizedPath ([string]$session.projectBinding.cliRoot)
if (-not $cliRoot) { throw 'Session receipt is missing the DevTools install root.' }
$listenerChain = @($session.listenerIdentity.processChain)
$anchorCandidates = @($listenerChain | Where-Object {
  $executable = Get-NormalizedPath ([string]$_.executablePath)
  $executable -and ($executable -eq $cliRoot -or $executable.StartsWith("$cliRoot\"))
})
if ($anchorCandidates.Count -eq 0) {
  throw 'Session listener process chain is not owned by the recorded DevTools install.'
}
$anchor = $anchorCandidates[-1]
$anchorProcessId = [int]$anchor.processId
$anchorStartFileTimeUtc = [string]$anchor.processStartFileTimeUtc
try {
  $liveAnchor = Get-Process -Id $anchorProcessId -ErrorAction Stop
  if ([string]$liveAnchor.StartTime.ToFileTimeUtc() -ne $anchorStartFileTimeUtc) {
    throw 'The recorded DevTools anchor PID has been reused.'
  }
} catch {
  throw "The recorded DevTools anchor process is no longer valid: $($_.Exception.Message)"
}

$probeId = [Guid]::NewGuid().ToString('N')
$captureRunId = "focus-$probeId"
$runRoot = Resolve-RepoRelativePath $repoRoot $env:WEAPP_UI_RUN_ROOT 'tmp\ui-runs'
$captureSurface = if ($env:WEAPP_CAPTURE_SURFACE) { $env:WEAPP_CAPTURE_SURFACE.Trim() } else { 'page' }
if ($captureSurface -notin @('page', 'simulator-frame')) { throw 'Unknown WEAPP_CAPTURE_SURFACE.' }
if ($captureSurface -eq 'simulator-frame') { $runRoot = Join-Path $runRoot 'simulator-frame' }
$manifestPath = Join-Path (Join-Path $runRoot $captureRunId) 'manifest.json'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$runnerPath = Join-Path $repoRoot 'scripts\dev\weapp-ui-screenshot.js'
$argumentParts = @('"' + $runnerPath.Replace('"', '\"') + '"') + $requestedCases
$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $nodePath
$startInfo.Arguments = $argumentParts -join ' '
$startInfo.WorkingDirectory = $repoRoot
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.EnvironmentVariables['WEAPP_FOCUS_PROBE_ID'] = $probeId
$startInfo.EnvironmentVariables['WEAPP_CAPTURE_RUN_ID'] = $captureRunId
$startInfo.EnvironmentVariables['WEAPP_CAPTURE_MODE'] = 'focus-probe-no-publish-v1'
$captureProcess = [Diagnostics.Process]::new()
$captureProcess.StartInfo = $startInfo

$foregroundCounts = @{}
$classificationCache = @{}
$observedTargetProcessIds = [Collections.Generic.HashSet[int]]::new()
[void]$observedTargetProcessIds.Add($anchorProcessId)
$sampleCount = 0
$devToolsForegroundHits = 0
$unknownClassificationCount = 0
$classificationErrors = @{}
$maxObservedSampleGapMs = 0.0
$maxClassificationDurationMs = 0.0
$timedOut = $false
$killAttempted = $false
$killSucceeded = $false
$killError = ''
$captureExited = $false
$captureExitCode = $null
$poisonWritten = $false
$poisonError = ''

# Warm the current foreground ancestry before both the timeout budget and sampling clock begin.
$warmClock = [Diagnostics.Stopwatch]::StartNew()
$warmForegroundProcessId = Get-ForegroundProcessId
[void](Get-CachedForegroundClassification `
  $warmForegroundProcessId `
  $anchorProcessId `
  $anchorStartFileTimeUtc `
  $cliRoot `
  $classificationCache `
  $observedTargetProcessIds)
$warmClock.Stop()
$warmDurationMs = $warmClock.Elapsed.TotalMilliseconds

$startedAt = [DateTimeOffset]::Now
$deadline = $startedAt.AddMilliseconds($timeoutMs)
$probeClock = [Diagnostics.Stopwatch]::StartNew()
$lastSampleAtMs = 0.0

if (-not $captureProcess.Start()) { throw 'Unable to start the background screenshot runner.' }
while (-not $captureProcess.HasExited) {
  $sampleAtMs = $probeClock.Elapsed.TotalMilliseconds
  $sampleGapMs = $sampleAtMs - $lastSampleAtMs
  if ($sampleGapMs -gt $maxObservedSampleGapMs) { $maxObservedSampleGapMs = $sampleGapMs }
  $lastSampleAtMs = $sampleAtMs
  $foregroundProcessId = Get-ForegroundProcessId
  $sampleCount += 1
  $key = [string]$foregroundProcessId
  if (-not $foregroundCounts.ContainsKey($key)) { $foregroundCounts[$key] = 0 }
  $foregroundCounts[$key] += 1
  $classificationStartedMs = $probeClock.Elapsed.TotalMilliseconds
  $classification = Get-CachedForegroundClassification `
    $foregroundProcessId `
    $anchorProcessId `
    $anchorStartFileTimeUtc `
    $cliRoot `
    $classificationCache `
    $observedTargetProcessIds
  $classificationDurationMs = $probeClock.Elapsed.TotalMilliseconds - $classificationStartedMs
  if ($classificationDurationMs -gt $maxClassificationDurationMs) {
    $maxClassificationDurationMs = $classificationDurationMs
  }
  if ($classification.state -eq 'target') {
    $devToolsForegroundHits += 1
  } elseif ($classification.state -eq 'unknown') {
    $unknownClassificationCount += 1
    $classificationKey = [string]$classification.reason
    if (-not $classificationErrors.ContainsKey($classificationKey)) { $classificationErrors[$classificationKey] = 0 }
    $classificationErrors[$classificationKey] += 1
  }
  if ([DateTimeOffset]::Now -ge $deadline) {
    $captureProcess.Refresh()
    if ($captureProcess.HasExited) { break }
    $timedOut = $true
    $poison = [ordered]@{
      kind = 'weapp-ui-session-poison-v1'
      reason = 'focus-probe-timeout'
      createdAt = [DateTimeOffset]::Now.ToString('o')
      fixtureStateUnknown = $true
      sessionFile = $sessionFile
      sessionId = [string]$session.sessionId
      endpoint = [string]$session.endpoint
      listenerIdentityHash = [string]$session.projectBinding.listenerIdentityHash
      focusProbeId = $probeId
      captureRunId = $captureRunId
      childProcessId = $captureProcess.Id
    }
    try {
      $poisonWritten = Write-SessionPoison $poisonFile $poison
    } catch {
      $poisonError = $_.Exception.Message
    }
    if ($poisonWritten) {
      $killAttempted = $true
      try {
        $captureProcess.Kill()
        $killSucceeded = $true
      } catch {
        $killError = $_.Exception.Message
      }
    } else {
      $killError = 'Kill was not attempted because the session poison marker could not be verified.'
    }
    break
  }
  Start-Sleep -Milliseconds $sampleIntervalMs
}
if ($captureProcess.HasExited) {
  $captureExited = $true
} else {
  $captureExited = $captureProcess.WaitForExit($killGraceMs)
}
if ($captureExited) { $captureExitCode = $captureProcess.ExitCode }
$samplingReliable = (
  $sampleCount -gt 0 `
  -and $unknownClassificationCount -eq 0 `
  -and $maxObservedSampleGapMs -le $maxSampleGapMs
)
$endedAt = [DateTimeOffset]::Now

$manifestValidation = [ordered]@{
  ok = $false
  exists = (Test-Path -LiteralPath $manifestPath -PathType Leaf)
  runId = $false
  focusProbeId = $false
  sessionId = $false
  endpoint = $false
  listenerIdentityHash = $false
  gitManifestHash = $false
  manifestOk = $false
  mode = $false
  probeOnly = $false
  promoted = $false
  finalsUntouched = $false
  singleCase = $false
  caseName = $false
}
if ($manifestValidation.exists) {
  try {
    $manifest = Read-Utf8JsonFile $manifestPath
    $manifestValidation.runId = ([string]$manifest.runId -eq $captureRunId)
    $manifestValidation.focusProbeId = ([string]$manifest.focusProbeId -eq $probeId)
    $manifestValidation.sessionId = ([string]$manifest.sessionContext.sessionId -eq [string]$session.sessionId)
    $manifestValidation.endpoint = ([string]$manifest.sessionContext.endpoint -eq [string]$session.endpoint)
    $manifestValidation.listenerIdentityHash = (
      [string]$manifest.sessionContext.listenerIdentityHash -eq [string]$session.projectBinding.listenerIdentityHash
    )
    $manifestValidation.gitManifestHash = (
      [string]$manifest.sessionContext.gitManifestHash -eq [string]$session.gitManifestHash
    )
    $manifestValidation.manifestOk = ($manifest.ok -eq $true)
    $manifestValidation.mode = ([string]$manifest.mode -eq 'focus-probe-no-publish-v1')
    $manifestValidation.probeOnly = ($manifest.promotion.probeOnly -eq $true)
    $manifestValidation.promoted = ($manifest.promotion.promoted -eq $false)
    $manifestValidation.finalsUntouched = (
      $manifest.finalsTouched -eq $false `
      -and $manifest.promotion.finalsTouched -eq $false
    )
    $manifestCases = @($manifest.cases)
    $manifestValidation.singleCase = ($manifestCases.Count -eq 1)
    $manifestValidation.caseName = (
      $manifestCases.Count -eq 1 `
      -and [string]$manifestCases[0].name -eq [string]$requestedCases[0]
    )
    $manifestValidation.ok = @(
      $manifestValidation.runId,
      $manifestValidation.focusProbeId,
      $manifestValidation.sessionId,
      $manifestValidation.endpoint,
      $manifestValidation.listenerIdentityHash,
      $manifestValidation.gitManifestHash,
      $manifestValidation.manifestOk,
      $manifestValidation.mode,
      $manifestValidation.probeOnly,
      $manifestValidation.promoted,
      $manifestValidation.finalsUntouched,
      $manifestValidation.singleCase,
      $manifestValidation.caseName
    ) -notcontains $false
  } catch {
    $manifestValidation.error = $_.Exception.Message
  }
}

$probeDir = Join-Path $repoRoot 'tmp\ui-focus-probes'
[IO.Directory]::CreateDirectory($probeDir) | Out-Null
$stamp = $startedAt.ToString('yyyyMMdd-HHmmss-fff')
$receiptPath = Join-Path $probeDir "$stamp-$probeId.json"
$sessionPoisonedAfter = (Test-Path -LiteralPath $poisonFile -PathType Leaf)
$receipt = [ordered]@{
  kind = 'weapp-ui-background-focus-probe-v3'
  captureSurface = $captureSurface
  ok = (
    -not $timedOut `
    -and $captureExited `
    -and $captureExitCode -eq 0 `
    -and $devToolsForegroundHits -eq 0 `
    -and $samplingReliable `
    -and $unknownClassificationCount -eq 0 `
    -and -not $sessionPoisonedAfter `
    -and $manifestValidation.ok
  )
  startedAt = $startedAt.ToString('o')
  endedAt = $endedAt.ToString('o')
  focusProbeId = $probeId
  captureRunId = $captureRunId
  manifestPath = $manifestPath
  manifestValidation = $manifestValidation
  warmDurationMs = $warmDurationMs
  sampleIntervalMs = $sampleIntervalMs
  timeoutMs = $timeoutMs
  timedOut = $timedOut
  sampleCount = $sampleCount
  captureExited = $captureExited
  captureExitCode = $captureExitCode
  killGraceMs = $killGraceMs
  killAttempted = $killAttempted
  killSucceeded = $killSucceeded
  killError = $killError
  poisonFile = $poisonFile
  poisonWritten = $poisonWritten
  poisonError = $poisonError
  sessionPoisonedAfter = $sessionPoisonedAfter
  cases = $requestedCases
  sessionFile = $sessionFile
  sessionId = [string]$session.sessionId
  endpoint = [string]$session.endpoint
  listenerIdentityHash = [string]$session.projectBinding.listenerIdentityHash
  gitManifestHash = [string]$session.gitManifestHash
  devToolsAnchorProcessId = $anchorProcessId
  devToolsAnchorStartFileTimeUtc = $anchorStartFileTimeUtc
  observedTargetProcessIds = @($observedTargetProcessIds | Sort-Object)
  devToolsForegroundHits = $devToolsForegroundHits
  foregroundProcessCounts = $foregroundCounts
  unknownClassificationCount = $unknownClassificationCount
  classificationErrors = $classificationErrors
  maxClassificationDurationMs = $maxClassificationDurationMs
  maxObservedSampleGapMs = $maxObservedSampleGapMs
  maxAllowedSampleGapMs = $maxSampleGapMs
  samplingReliable = $samplingReliable
  focusClaim = 'sampling-period-no-observed-devtools-foreground'
  inputInjectionProbe = 'not-instrumented'
  receiptPath = $receiptPath
}
$candidatePath = "$receiptPath.$PID.candidate"
[IO.File]::WriteAllText(
  $candidatePath,
  (($receipt | ConvertTo-Json -Depth 8) + [Environment]::NewLine),
  [Text.UTF8Encoding]::new($false)
)
Move-Item -LiteralPath $candidatePath -Destination $receiptPath
$receipt | ConvertTo-Json -Depth 8
if ($receipt.ok) { exit 0 }
exit 2
