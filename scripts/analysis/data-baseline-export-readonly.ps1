[CmdletBinding()]
param(
    [ValidateSet('tournaments', 'client_request_logs')]
    [string]$Collection = 'tournaments',
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,
    [string]$WsEndpoint = 'ws://127.0.0.1:39420',
    [int]$CliPort = 39421,
    [ValidateRange(1, 20)]
    [int]$PageSize = 20,
    [ValidateRange(2, 5)]
    [int]$MaximumPasses = 3
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path -Path $PSScriptRoot -ChildPath '..\..'))
. (Join-Path -Path $repoRoot -ChildPath 'scripts\dev\weapp-powershell-common.ps1')

function Resolve-PathInsideWorktree {
    param([Parameter(Mandatory = $true)][string]$Value)

    $absolute = [IO.Path]::GetFullPath((Join-Path -Path $repoRoot -ChildPath $Value))
    $rootPrefix = "$($repoRoot.TrimEnd('\', '/'))$([IO.Path]::DirectorySeparatorChar)"
    if (-not $absolute.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'OutputPath must be a file inside the current worktree.'
    }
    return $absolute
}

function Get-WorktreeRelativePath {
    param([Parameter(Mandatory = $true)][string]$AbsolutePath)

    $rootPrefix = "$($repoRoot.TrimEnd('\', '/'))$([IO.Path]::DirectorySeparatorChar)"
    if (-not $AbsolutePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Path must be inside the current worktree.'
    }
    return $AbsolutePath.Substring($rootPrefix.Length)
}

function Get-Sha256Text {
    param([Parameter(Mandatory = $true)][string]$Text)

    $bytes = [Text.Encoding]::UTF8.GetBytes($Text)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
    }
}

$countFunction = @'
function (collectionName) {
  const db = wx.cloud.database();
  return db.collection(collectionName).count().then(function (result) {
    return { ok: true, total: Number(result && result.total || 0) };
  }).catch(function (error) {
    return { ok: false, code: String(error && (error.errCode || error.code) || 'unknown') };
  });
}
'@

$pageFunction = @'
function (collectionName, afterId, pageSize) {
  const db = wx.cloud.database();
  const command = db.command;
  let query = db.collection(collectionName);
  if (afterId) query = query.where({ _id: command.gt(afterId) });
  return query.orderBy('_id', 'asc').limit(pageSize).get().then(function (result) {
    const docs = Array.isArray(result && result.data) ? result.data : [];
    return {
      ok: true,
      docs: docs,
      lastId: docs.length ? String(docs[docs.length - 1]._id || '') : '',
      done: docs.length < pageSize
    };
  }).catch(function (error) {
    return { ok: false, code: String(error && (error.errCode || error.code) || 'unknown') };
  });
}
'@

function Get-RemoteCount {
    $result = Invoke-WeappAppFunction -WsEndpoint $WsEndpoint -FunctionDeclaration $countFunction `
        -Arguments @($Collection) -TimeoutMilliseconds 20000
    if (-not $result -or -not $result.ok) {
        $code = if ($result) { [string]$result.code } else { 'no_result' }
        throw "Read-only count failed for collection ${Collection}: ${code}"
    }
    return [int]$result.total
}

function Read-CollectionPass {
    param([Parameter(Mandatory = $true)][int]$PassNumber)

    $documents = [Collections.Generic.List[object]]::new()
    $afterId = ''
    $pageNumber = 0
    while ($true) {
        $pageNumber += 1
        $result = Invoke-WeappAppFunction -WsEndpoint $WsEndpoint -FunctionDeclaration $pageFunction `
            -Arguments @($Collection, $afterId, $PageSize) -TimeoutMilliseconds 30000
        if (-not $result -or -not $result.ok) {
            $code = if ($result) { [string]$result.code } else { 'no_result' }
            throw "Read-only page failed for collection ${Collection}, pass ${PassNumber}, page ${pageNumber}: ${code}"
        }

        $pageDocuments = @($result.docs)
        foreach ($document in $pageDocuments) { $documents.Add($document) }
        if ($pageDocuments.Count -gt 0) {
            $nextId = [string]$result.lastId
            if ([string]::IsNullOrWhiteSpace($nextId) -or
                (-not [string]::IsNullOrWhiteSpace($afterId) -and [string]::CompareOrdinal($nextId, $afterId) -le 0)) {
                throw "Keyset pagination did not advance for collection ${Collection}."
            }
            $afterId = $nextId
        }

        if (($pageNumber % 10) -eq 0) {
            Write-Host "pass=${PassNumber} pages=${pageNumber} records=$($documents.Count)"
        }
        if ([bool]$result.done) { break }
        if ($pageDocuments.Count -eq 0) {
            throw "Keyset pagination returned an empty non-terminal page for collection ${Collection}."
        }
    }

    $ids = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $previousId = ''
    foreach ($document in $documents) {
        $id = [string]$document._id
        if ([string]::IsNullOrWhiteSpace($id)) {
            throw "A ${Collection} document is missing _id."
        }
        if (-not $ids.Add($id)) {
            throw "Duplicate _id detected in ${Collection} export."
        }
        if (-not [string]::IsNullOrWhiteSpace($previousId) -and
            [string]::CompareOrdinal($id, $previousId) -le 0) {
            throw "Export order is not strictly increasing for ${Collection}."
        }
        $previousId = $id
    }

    $documentArray = [object[]]$documents.ToArray()
    $canonicalJson = ConvertTo-Json -InputObject $documentArray -Depth 100 -Compress
    return [pscustomobject]@{
        Documents = $documentArray
        Count = $documentArray.Count
        Pages = $pageNumber
        Sha256 = Get-Sha256Text -Text $canonicalJson
    }
}

$outputFile = Resolve-PathInsideWorktree -Value $OutputPath
$expectedPrefix = [IO.Path]::GetFullPath((Join-Path -Path $repoRoot -ChildPath 'data\we-analysis'))
if (-not $outputFile.StartsWith("$expectedPrefix$([IO.Path]::DirectorySeparatorChar)", [StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputPath must be inside data/we-analysis/.'
}

$sessionRecord = Join-Path -Path $repoRoot -ChildPath 'tmp\weapp-automation-session.json'
if (-not (Test-WeappSessionRecord -RecordPath $sessionRecord -ProjectDir $repoRoot `
    -WsEndpoint $WsEndpoint -Role source -CliPort $CliPort)) {
    throw 'The DevTools session is not proven to be bound to this worktree.'
}

$countBefore = Get-RemoteCount
$previousPass = $null
$stablePass = $null
$passesExecuted = 0
for ($pass = 1; $pass -le $MaximumPasses; $pass += 1) {
    $passesExecuted = $pass
    $currentPass = Read-CollectionPass -PassNumber $pass
    Write-Host "pass=${pass} complete records=$($currentPass.Count) sha256=$($currentPass.Sha256)"
    if ($previousPass -and $previousPass.Sha256 -eq $currentPass.Sha256) {
        $stablePass = $currentPass
        break
    }
    $previousPass = $currentPass
}
if (-not $stablePass) {
    throw "No two consecutive ${Collection} snapshots matched within ${MaximumPasses} passes."
}

$countAfter = Get-RemoteCount
if ($stablePass.Count -ne $countBefore -or $stablePass.Count -ne $countAfter) {
    throw "Collection count changed during export: before=${countBefore}, exported=$($stablePass.Count), after=${countAfter}."
}

$payload = [ordered]@{
    schemaVersion = 1
    source = 'wx.cloud.database_client_read_context'
    collection = $Collection
    retrievedAtUtc = [DateTime]::UtcNow.ToString('o')
    cliPort = $CliPort
    automationEndpoint = $WsEndpoint
    pagination = [ordered]@{
        type = '_id_ascending_keyset'
        pageSize = $PageSize
        pages = $stablePass.Pages
    }
    consistency = [ordered]@{
        countBefore = $countBefore
        exportedCount = $stablePass.Count
        countAfter = $countAfter
        consecutiveSnapshotSha256 = $stablePass.Sha256
        passesExecuted = $passesExecuted
        stable = $true
    }
    documents = $stablePass.Documents
}

$directory = Split-Path -Parent $outputFile
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$json = ConvertTo-Json -InputObject $payload -Depth 100
[IO.File]::WriteAllText($outputFile, "$json`n", [Text.UTF8Encoding]::new($false))

[pscustomobject]@{
    Collection = $Collection
    Output = Get-WorktreeRelativePath -AbsolutePath $outputFile
    Records = $stablePass.Count
    SnapshotSha256 = $stablePass.Sha256
    Passes = $passesExecuted
    RemoteWritesExecuted = $false
}
