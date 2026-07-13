$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8NoBom
$global:OutputEncoding = $utf8NoBom

function Resolve-WeappCliPath {
    param([string]$RequestedPath)

    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        $candidates += $RequestedPath
    }
    $candidates += 'D:\Soft\wechatwebdevtools\cli.bat'
    $discovered = Get-ChildItem -LiteralPath 'D:\Soft' -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like '*web*' } |
        Sort-Object -Property FullName |
        ForEach-Object { Join-Path -Path $_.FullName -ChildPath 'cli.bat' }
    $candidates += @($discovered)

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return [IO.Path]::GetFullPath($candidate)
        }
    }
    throw "WeChat DevTools CLI not found. Checked: $($candidates -join ', ')"
}

function Assert-WeappProjectLayout {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectDir,
        [ValidateSet('source', 'preview')][string]$Role = 'source'
    )

    if (-not (Test-Path -LiteralPath $ProjectDir -PathType Container)) {
        throw "WeChat project directory not found: $ProjectDir"
    }
    $required = @('project.config.json', 'miniprogram\app.js')
    if ($Role -eq 'source') {
        $required += @('package.json', '.git')
    }
    $missing = @()
    foreach ($relativePath in $required) {
        $candidate = Join-Path -Path $ProjectDir -ChildPath $relativePath
        if (-not (Test-Path -LiteralPath $candidate)) {
            $missing += $relativePath
        }
    }
    if ($missing.Count -gt 0) {
        throw "Invalid $Role project layout at ${ProjectDir}; missing: $($missing -join ', ')"
    }
}

function Invoke-WeappCli {
    param(
        [Parameter(Mandatory = $true)][string]$CliPath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [switch]$IgnoreFailure
    )

    Push-Location -LiteralPath $WorkingDirectory
    try {
        & $CliPath @Arguments | Out-Host
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) { $exitCode = 0 }
        if ($exitCode -ne 0 -and -not $IgnoreFailure) {
            throw "WeChat DevTools CLI failed with exit ${exitCode}: $($Arguments -join ' ')"
        }
        return $exitCode
    } finally {
        Pop-Location
    }
}

function Get-WeappDevToolsProcesses {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'wechatdevtools.exe'" -ErrorAction SilentlyContinue |
        Where-Object { [string]$_.CommandLine -notmatch '--type=crashpad-handler' }
    return @($processes)
}

function Get-WeappDevToolsProcessIds {
    return @(Get-WeappDevToolsProcesses | ForEach-Object { [uint32]$_.ProcessId })
}

function ConvertTo-WeappUtcTimestamp {
    param([Parameter(Mandatory = $true)]$Value)

    try {
        return ([DateTimeOffset]$Value).ToUniversalTime().ToString('o')
    } catch {
        return $null
    }
}

function Get-WeappMainProcess {
    param(
        [Parameter(Mandatory = $true)][uint32]$ProcessId,
        [Parameter(Mandatory = $true)][object[]]$Processes
    )

    $processById = @{}
    foreach ($process in $Processes) {
        $processById[[string][uint32]$process.ProcessId] = $process
    }

    $visited = @{}
    $currentId = $ProcessId
    while ($currentId -and $processById.ContainsKey([string]$currentId)) {
        if ($visited.ContainsKey([string]$currentId)) { return $null }
        $visited[[string]$currentId] = $true
        $current = $processById[[string]$currentId]
        if ([string]$current.CommandLine -notmatch '(^|\s)--type=') {
            return $current
        }
        $currentId = [uint32]$current.ParentProcessId
    }
    return $null
}

function Get-WeappProcessTreeSnapshot {
    param(
        [Parameter(Mandatory = $true)][uint32]$MainProcessId,
        [Parameter(Mandatory = $true)][object[]]$Processes
    )

    $snapshot = @()
    foreach ($process in @($Processes)) {
        $mainProcess = Get-WeappMainProcess -ProcessId ([uint32]$process.ProcessId) -Processes $Processes
        if (-not $mainProcess -or [uint32]$mainProcess.ProcessId -ne $MainProcessId) { continue }
        $creationDate = ConvertTo-WeappUtcTimestamp -Value $process.CreationDate
        if (-not $creationDate) { throw "Cannot snapshot WeChat DevTools process creation time: PID=$($process.ProcessId)" }
        $snapshot += [pscustomobject]@{
            ProcessId = [uint32]$process.ProcessId
            CreationDate = $creationDate
        }
    }
    if (-not @($snapshot | Where-Object { [uint32]$_.ProcessId -eq $MainProcessId }).Count) {
        throw "Cannot snapshot the target WeChat DevTools main process: PID=$MainProcessId"
    }
    return $snapshot
}

function Test-WeappProcessTreeExited {
    param(
        [Parameter(Mandatory = $true)][object[]]$Snapshot,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$CurrentProcesses
    )

    foreach ($target in @($Snapshot)) {
        foreach ($current in @($CurrentProcesses | Where-Object { [uint32]$_.ProcessId -eq [uint32]$target.ProcessId })) {
            $currentCreationDate = ConvertTo-WeappUtcTimestamp -Value $current.CreationDate
            if ($currentCreationDate -and $currentCreationDate -eq [string]$target.CreationDate) {
                return $false
            }
        }
    }
    return $true
}

function Test-WeappCliHttpPort {
    param([Parameter(Mandatory = $true)][int]$Port)

    $statusCode = 0
    try {
        $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/")
        $request.Timeout = 400
        $request.ReadWriteTimeout = 400
        $response = $request.GetResponse()
        try {
            $statusCode = [int]$response.StatusCode
        } finally {
            $response.Dispose()
        }
    } catch {
        $exception = $_.Exception
        while ($exception) {
            if ($exception.PSObject.Properties.Name -contains 'Response' -and $exception.Response) {
                $statusCode = [int]$exception.Response.StatusCode
                break
            }
            $exception = $exception.InnerException
        }
    }
    return $statusCode -eq 404
}

function Get-WeappCliServerIdentity {
    param(
        [Parameter(Mandatory = $true)][int]$ExpectedPort,
        [object[]]$Processes,
        [object[]]$TcpConnections
    )

    if (-not $PSBoundParameters.ContainsKey('Processes')) {
        $Processes = @(Get-WeappDevToolsProcesses)
    }
    $processes = @($Processes)
    if ($processes.Count -eq 0) { return $null }
    $processIds = @($processes | ForEach-Object { [uint32]$_.ProcessId })
    if (-not $PSBoundParameters.ContainsKey('TcpConnections')) {
        $TcpConnections = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
    }
    $listeners = @($TcpConnections |
        Where-Object {
            $_.LocalAddress -in @('127.0.0.1', '0.0.0.0', '::1', '::') -and
            [int]$_.LocalPort -eq $ExpectedPort -and
            [uint32]$_.OwningProcess -in $processIds
        })
    if ($listeners.Count -eq 0 -or -not (Test-WeappCliHttpPort -Port $ExpectedPort)) {
        return $null
    }

    $owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($owners.Count -ne 1) { return $null }
    $identities = @()
    foreach ($ownerId in $owners) {
        $mainProcess = Get-WeappMainProcess -ProcessId ([uint32]$ownerId) -Processes $processes
        if (-not $mainProcess) { return $null }
        $declaredPortPattern = '(?:^|\s)--ide-http-port(?:=|\s+)"?{0}"?(?:\s|$)' -f [regex]::Escape([string]$ExpectedPort)
        if (-not [regex]::IsMatch([string]$mainProcess.CommandLine, $declaredPortPattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
            return $null
        }
        $creationDate = ConvertTo-WeappUtcTimestamp -Value $mainProcess.CreationDate
        if (-not $creationDate) { return $null }
        $identities += [pscustomobject]@{
            MainProcessId = [uint32]$mainProcess.ProcessId
            MainProcessCreationDate = $creationDate
            CliServerPort = $ExpectedPort
            CliServerProcessId = [uint32]$ownerId
        }
    }

    return $identities | Select-Object -First 1
}

function Get-WeappCliServerPort {
    param([int]$ExpectedPort = 39421)

    $identity = Get-WeappCliServerIdentity -ExpectedPort $ExpectedPort
    if (-not $identity) { return $null }
    return [int]$identity.CliServerPort
}

function Get-WeappSessionProcessIdentity {
    param(
        [Parameter(Mandatory = $true)][int]$ExpectedCliPort,
        [Parameter(Mandatory = $true)][string]$WsEndpoint
    )

    try {
        $automationPort = [Uri]::new($WsEndpoint).Port
    } catch {
        return $null
    }
    $processes = @(Get-WeappDevToolsProcesses)
    if ($processes.Count -eq 0) { return $null }
    $listenerPorts = @([uint16]$ExpectedCliPort, [uint16]$automationPort) | Select-Object -Unique
    $tcpConnections = @(Get-NetTCPConnection -State Listen -LocalPort $listenerPorts -ErrorAction SilentlyContinue)
    $cliIdentity = Get-WeappCliServerIdentity -ExpectedPort $ExpectedCliPort -Processes $processes -TcpConnections $tcpConnections
    if (-not $cliIdentity) { return $null }
    $processIds = @($processes | ForEach-Object { [uint32]$_.ProcessId })
    $listeners = @($tcpConnections |
        Where-Object {
            $_.LocalAddress -in @('127.0.0.1', '0.0.0.0', '::1', '::') -and
            [int]$_.LocalPort -eq $automationPort -and
            [uint32]$_.OwningProcess -in $processIds
        })
    if ($listeners.Count -eq 0) { return $null }

    $automationOwners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    $matchingOwners = @()
    foreach ($ownerId in $automationOwners) {
        $mainProcess = Get-WeappMainProcess -ProcessId ([uint32]$ownerId) -Processes $processes
        if (-not $mainProcess) { return $null }
        $creationDate = ConvertTo-WeappUtcTimestamp -Value $mainProcess.CreationDate
        if ([uint32]$mainProcess.ProcessId -eq [uint32]$cliIdentity.MainProcessId -and
            $creationDate -eq [string]$cliIdentity.MainProcessCreationDate) {
            $matchingOwners += [uint32]$ownerId
        }
    }
    if ($matchingOwners.Count -ne 1 -or $automationOwners.Count -ne 1) { return $null }

    return [pscustomobject]@{
        MainProcessId = [uint32]$cliIdentity.MainProcessId
        MainProcessCreationDate = [string]$cliIdentity.MainProcessCreationDate
        CliServerPort = [int]$cliIdentity.CliServerPort
        CliServerProcessId = [uint32]$cliIdentity.CliServerProcessId
        AutomationPort = $automationPort
        AutomationProcessId = [uint32]$matchingOwners[0]
    }
}

function Wait-WeappSessionProcessIdentity {
    param(
        [Parameter(Mandatory = $true)][int]$ExpectedCliPort,
        [Parameter(Mandatory = $true)][string]$WsEndpoint,
        [int]$TimeoutSeconds = 15
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $identity = Get-WeappSessionProcessIdentity -ExpectedCliPort $ExpectedCliPort -WsEndpoint $WsEndpoint
        if ($identity) { return $identity }
        Start-Sleep -Milliseconds 500
    }
    throw "DevTools process identity was not provable for CLI port ${ExpectedCliPort} and ${WsEndpoint}."
}

function Stop-WeappDevToolsCli {
    param(
        [Parameter(Mandatory = $true)][string]$CliPath,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [int]$ExpectedPort = 39421,
        [int]$TimeoutSeconds = 20
    )

    $processes = @(Get-WeappDevToolsProcesses)
    if ($processes.Count -eq 0) { return }
    $tcpConnections = @(Get-NetTCPConnection -State Listen -LocalPort ([uint16]$ExpectedPort) -ErrorAction SilentlyContinue)
    $cliIdentity = Get-WeappCliServerIdentity -ExpectedPort $ExpectedPort -Processes $processes -TcpConnections $tcpConnections
    if (-not $cliIdentity) {
        throw 'WeChat DevTools is running, but its CLI HTTP server port could not be identified safely.'
    }
    $targetSnapshot = @(Get-WeappProcessTreeSnapshot -MainProcessId ([uint32]$cliIdentity.MainProcessId) -Processes $processes)
    $serverPort = [int]$cliIdentity.CliServerPort
    $null = Invoke-WeappCli -CliPath $CliPath -Arguments @('quit', '--port', [string]$serverPort) -WorkingDirectory $WorkingDirectory

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $currentProcesses = @(Get-WeappDevToolsProcesses)
        if (Test-WeappProcessTreeExited -Snapshot $targetSnapshot -CurrentProcesses $currentProcesses) { return }
        Start-Sleep -Milliseconds 500
    }
    throw "The target WeChat DevTools process tree did not exit within ${TimeoutSeconds}s after quit on CLI port ${serverPort}."
}

function Show-WeappDevToolsWindow {
    param(
        [Parameter(Mandatory = $true)][uint32]$ProcessId,
        [Parameter(Mandatory = $true)][string]$ProcessCreationDate
    )

    $candidates = @(Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue |
        Where-Object { [string]$_.Name -eq 'wechatdevtools.exe' })
    if ($candidates.Count -ne 1 -or
        (ConvertTo-WeappUtcTimestamp -Value $candidates[0].CreationDate) -ne $ProcessCreationDate) {
        throw "The session-bound WeChat DevTools process is unavailable or was replaced: PID=$ProcessId"
    }
    $windowProcess = Get-Process -Id $ProcessId -ErrorAction Stop
    if ($windowProcess.MainWindowHandle -eq 0) {
        throw "The session-bound WeChat DevTools main window is unavailable: PID=$ProcessId"
    }

    if (-not ('WeappNativeWindow' -as [type])) {
        Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WeappNativeWindow {
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
    }
    # SW_SHOWNOACTIVATE keeps hooks/automation from stealing focus from the user.
    $null = [WeappNativeWindow]::ShowWindowAsync($windowProcess.MainWindowHandle, 4)
    return $true
}

function Get-WeappToolInfo {
    param(
        [Parameter(Mandatory = $true)][string]$WsEndpoint,
        [int]$TimeoutMilliseconds = 5000
    )

    $uri = [Uri]::new($WsEndpoint)
    $requestId = "tool-info-$PID-$([Guid]::NewGuid().ToString('N'))"
    $request = @{ id = $requestId; method = 'Tool.getInfo'; params = @{} } | ConvertTo-Json -Compress
    $socket = [Net.WebSockets.ClientWebSocket]::new()
    $cancellation = [Threading.CancellationTokenSource]::new()
    $cancellation.CancelAfter($TimeoutMilliseconds)
    try {
        $null = $socket.ConnectAsync($uri, $cancellation.Token).GetAwaiter().GetResult()
        $payload = [Text.Encoding]::UTF8.GetBytes($request)
        $null = $socket.SendAsync(
            [ArraySegment[byte]]::new($payload),
            [Net.WebSockets.WebSocketMessageType]::Text,
            $true,
            $cancellation.Token
        ).GetAwaiter().GetResult()

        while ($true) {
            $stream = [IO.MemoryStream]::new()
            try {
                do {
                    $buffer = New-Object byte[] 8192
                    $result = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), $cancellation.Token).GetAwaiter().GetResult()
                    if ($result.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) {
                        throw 'Automation WebSocket closed before Tool.getInfo responded.'
                    }
                    $stream.Write($buffer, 0, $result.Count)
                } while (-not $result.EndOfMessage)
                $text = [Text.Encoding]::UTF8.GetString($stream.ToArray())
                $message = $text | ConvertFrom-Json
                if ($message.id -eq $requestId) {
                    if (-not $message.result -or -not $message.result.version -or -not $message.result.SDKVersion) {
                        throw "Tool.getInfo returned an incomplete result: $text"
                    }
                    return $message.result
                }
            } finally {
                $stream.Dispose()
            }
        }
    } finally {
        $cancellation.Dispose()
        $socket.Dispose()
    }
}

function Get-WeappCurrentPage {
    param(
        [Parameter(Mandatory = $true)][string]$WsEndpoint,
        [int]$TimeoutMilliseconds = 5000
    )

    $uri = [Uri]::new($WsEndpoint)
    $requestId = "current-page-$PID-$([Guid]::NewGuid().ToString('N'))"
    $request = @{ id = $requestId; method = 'App.getCurrentPage'; params = @{} } | ConvertTo-Json -Compress
    $socket = [Net.WebSockets.ClientWebSocket]::new()
    $cancellation = [Threading.CancellationTokenSource]::new()
    $cancellation.CancelAfter($TimeoutMilliseconds)
    try {
        $null = $socket.ConnectAsync($uri, $cancellation.Token).GetAwaiter().GetResult()
        $payload = [Text.Encoding]::UTF8.GetBytes($request)
        $null = $socket.SendAsync(
            [ArraySegment[byte]]::new($payload),
            [Net.WebSockets.WebSocketMessageType]::Text,
            $true,
            $cancellation.Token
        ).GetAwaiter().GetResult()

        while ($true) {
            $stream = [IO.MemoryStream]::new()
            try {
                do {
                    $buffer = New-Object byte[] 8192
                    $result = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), $cancellation.Token).GetAwaiter().GetResult()
                    if ($result.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) {
                        throw 'Automation WebSocket closed before App.getCurrentPage responded.'
                    }
                    $stream.Write($buffer, 0, $result.Count)
                } while (-not $result.EndOfMessage)
                $text = [Text.Encoding]::UTF8.GetString($stream.ToArray())
                $message = $text | ConvertFrom-Json
                if ($message.id -eq $requestId) {
                    if ($message.error) {
                        throw "App.getCurrentPage returned an error: $text"
                    }
                    if (-not $message.result -or -not $message.result.path) {
                        throw "App.getCurrentPage returned an incomplete result: $text"
                    }
                    return $message.result
                }
            } finally {
                $stream.Dispose()
            }
        }
    } finally {
        $cancellation.Dispose()
        $socket.Dispose()
    }
}

function Invoke-WeappAppFunction {
    param(
        [Parameter(Mandatory = $true)][string]$WsEndpoint,
        [Parameter(Mandatory = $true)][string]$FunctionDeclaration,
        [object[]]$Arguments = @(),
        [int]$TimeoutMilliseconds = 5000
    )

    $uri = [Uri]::new($WsEndpoint)
    $requestId = "app-function-$PID-$([Guid]::NewGuid().ToString('N'))"
    $request = @{
        id = $requestId
        method = 'App.callFunction'
        params = @{
            functionDeclaration = $FunctionDeclaration
            args = @($Arguments)
        }
    } | ConvertTo-Json -Compress -Depth 6
    $socket = [Net.WebSockets.ClientWebSocket]::new()
    $cancellation = [Threading.CancellationTokenSource]::new()
    $cancellation.CancelAfter($TimeoutMilliseconds)
    try {
        $null = $socket.ConnectAsync($uri, $cancellation.Token).GetAwaiter().GetResult()
        $payload = [Text.Encoding]::UTF8.GetBytes($request)
        $null = $socket.SendAsync(
            [ArraySegment[byte]]::new($payload),
            [Net.WebSockets.WebSocketMessageType]::Text,
            $true,
            $cancellation.Token
        ).GetAwaiter().GetResult()

        while ($true) {
            $stream = [IO.MemoryStream]::new()
            try {
                do {
                    $buffer = New-Object byte[] 8192
                    $result = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), $cancellation.Token).GetAwaiter().GetResult()
                    if ($result.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) {
                        throw 'Automation WebSocket closed before App.callFunction responded.'
                    }
                    $stream.Write($buffer, 0, $result.Count)
                } while (-not $result.EndOfMessage)
                $text = [Text.Encoding]::UTF8.GetString($stream.ToArray())
                $message = $text | ConvertFrom-Json
                if ($message.id -eq $requestId) {
                    if ($message.error) {
                        throw "App.callFunction returned an error: $text"
                    }
                    if ($null -eq $message.result -or
                        -not ($message.result.PSObject.Properties.Name -contains 'result')) {
                        throw "App.callFunction returned an incomplete result: $text"
                    }
                    return $message.result.result
                }
            } finally {
                $stream.Dispose()
            }
        }
    } finally {
        $cancellation.Dispose()
        $socket.Dispose()
    }
}

function Get-WeappRuntimeBinding {
    param(
        [Parameter(Mandatory = $true)][string]$WsEndpoint,
        [int]$TimeoutMilliseconds = 5000
    )

    $declaration = 'function () { const app = getApp(); return app && app.__codexAutomationRuntimeBinding ? app.__codexAutomationRuntimeBinding : ""; }'
    return Invoke-WeappAppFunction -WsEndpoint $WsEndpoint -FunctionDeclaration $declaration `
        -TimeoutMilliseconds $TimeoutMilliseconds
}

function Set-WeappRuntimeBinding {
    param(
        [Parameter(Mandatory = $true)][string]$WsEndpoint,
        [Parameter(Mandatory = $true)][string]$Binding,
        [int]$TimeoutMilliseconds = 5000
    )

    if ($Binding -notmatch '^[a-f0-9]{32}$') {
        throw 'Runtime binding must be a 32-character hexadecimal token.'
    }
    $declaration = 'function (value) { const app = getApp(); if (!app) return ""; Object.defineProperty(app, "__codexAutomationRuntimeBinding", { value, writable: true, configurable: true, enumerable: false }); return app.__codexAutomationRuntimeBinding; }'
    $actual = Invoke-WeappAppFunction -WsEndpoint $WsEndpoint -FunctionDeclaration $declaration `
        -Arguments @($Binding) -TimeoutMilliseconds $TimeoutMilliseconds
    if ([string]$actual -cne $Binding) {
        throw 'AppService runtime did not retain the automation binding token.'
    }
    return [string]$actual
}

function Test-WeappRuntimeBinding {
    param(
        [Parameter(Mandatory = $true)][string]$WsEndpoint,
        [Parameter(Mandatory = $true)][string]$ExpectedBinding,
        [int]$TimeoutMilliseconds = 5000
    )

    if ($ExpectedBinding -notmatch '^[a-f0-9]{32}$') { return $false }
    try {
        return [string](Get-WeappRuntimeBinding -WsEndpoint $WsEndpoint `
            -TimeoutMilliseconds $TimeoutMilliseconds) -ceq $ExpectedBinding
    } catch {
        return $false
    }
}

function Wait-WeappCurrentPage {
    param(
        [Parameter(Mandatory = $true)][string]$WsEndpoint,
        [int]$TimeoutSeconds = 30,
        [int]$ProbeTimeoutMilliseconds = 5000
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $lastError = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            return Get-WeappCurrentPage -WsEndpoint $WsEndpoint -TimeoutMilliseconds $ProbeTimeoutMilliseconds
        } catch {
            $lastError = $_
            Start-Sleep -Milliseconds 750
        }
    }
    if ($lastError) {
        throw "App.getCurrentPage was not ready within ${TimeoutSeconds}s at ${WsEndpoint}: $($lastError.Exception.Message)"
    }
    throw "App.getCurrentPage was not ready within ${TimeoutSeconds}s at ${WsEndpoint}"
}

function Wait-WeappToolInfo {
    param(
        [Parameter(Mandatory = $true)][string]$WsEndpoint,
        [int]$TimeoutSeconds = 60,
        [int]$ProbeTimeoutMilliseconds = 5000
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $lastError = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            return Get-WeappToolInfo -WsEndpoint $WsEndpoint -TimeoutMilliseconds $ProbeTimeoutMilliseconds
        } catch {
            $lastError = $_
            Start-Sleep -Milliseconds 750
        }
    }
    if ($lastError) {
        throw "Tool.getInfo was not ready within ${TimeoutSeconds}s at ${WsEndpoint}: $($lastError.Exception.Message)"
    }
    throw "Tool.getInfo was not ready within ${TimeoutSeconds}s at ${WsEndpoint}"
}

function Test-WeappSessionRecordMetadata {
    param(
        [Parameter(Mandatory = $true)][string]$RecordPath,
        [Parameter(Mandatory = $true)][string]$ProjectDir,
        [Parameter(Mandatory = $true)][string]$WsEndpoint,
        [Parameter(Mandatory = $true)][string]$Role,
        [Parameter(Mandatory = $true)][int]$CliPort,
        [int]$MaxRecordAgeMinutes = 720
    )

    if (-not (Test-Path -LiteralPath $RecordPath -PathType Leaf)) { return $false }
    try {
        $record = Get-Content -Raw -LiteralPath $RecordPath | ConvertFrom-Json
        if ([int]$record.schemaVersion -ne 3) { return $false }
        $expected = [IO.Path]::GetFullPath($ProjectDir).TrimEnd('\')
        $actual = [IO.Path]::GetFullPath([string]$record.projectDir).TrimEnd('\')
        if (-not $actual.Equals($expected, [StringComparison]::OrdinalIgnoreCase) -or
            $record.wsEndpoint -ne $WsEndpoint -or
            $record.role -ne $Role -or
            [int]$record.cliServerPort -ne $CliPort) {
            return $false
        }
        if ([string]$record.runtimeBinding -notmatch '^[a-f0-9]{32}$') { return $false }

        $verifiedAt = [DateTimeOffset]::Parse([string]$record.verifiedAt).ToUniversalTime()
        $recordAge = [DateTimeOffset]::UtcNow - $verifiedAt
        if ($recordAge.TotalMinutes -lt -5 -or $recordAge.TotalMinutes -gt $MaxRecordAgeMinutes) {
            return $false
        }

        return $true
    } catch {
        return $false
    }
}

function Test-WeappSessionRecord {
    param(
        [Parameter(Mandatory = $true)][string]$RecordPath,
        [Parameter(Mandatory = $true)][string]$ProjectDir,
        [Parameter(Mandatory = $true)][string]$WsEndpoint,
        [Parameter(Mandatory = $true)][string]$Role,
        [Parameter(Mandatory = $true)][int]$CliPort,
        [int]$MaxRecordAgeMinutes = 720,
        [object]$ProcessIdentity = $null
    )

    if (-not (Test-WeappSessionRecordMetadata -RecordPath $RecordPath -ProjectDir $ProjectDir `
        -WsEndpoint $WsEndpoint -Role $Role -CliPort $CliPort -MaxRecordAgeMinutes $MaxRecordAgeMinutes)) {
        return $false
    }
    try {
        $record = Get-Content -Raw -LiteralPath $RecordPath | ConvertFrom-Json
        $current = if ($ProcessIdentity) {
            $ProcessIdentity
        } else {
            Get-WeappSessionProcessIdentity -ExpectedCliPort $CliPort -WsEndpoint $WsEndpoint
        }
        if (-not $current) { return $false }
        $recordCreationValue = $record.mainProcessCreationDate
        $currentCreationValue = $current.MainProcessCreationDate
        $recordCreationDate = ConvertTo-WeappUtcTimestamp -Value $recordCreationValue
        $currentCreationDate = ConvertTo-WeappUtcTimestamp -Value $currentCreationValue
        if (-not $recordCreationDate -or -not $currentCreationDate) { return $false }
        return [uint32]$record.mainProcessId -eq [uint32]$current.MainProcessId -and
            $recordCreationDate -eq $currentCreationDate -and
            [int]$record.cliServerPort -eq [int]$current.CliServerPort -and
            [int]$record.automationPort -eq [int]$current.AutomationPort
    } catch {
        return $false
    }
}

function Write-WeappSessionRecord {
    param(
        [Parameter(Mandatory = $true)][string]$RecordPath,
        [Parameter(Mandatory = $true)][string]$ProjectDir,
        [Parameter(Mandatory = $true)][string]$WsEndpoint,
        [Parameter(Mandatory = $true)][string]$Role,
        [Parameter(Mandatory = $true)]$ToolInfo,
        [Parameter(Mandatory = $true)]$ProcessIdentity,
        [Parameter(Mandatory = $true)][string]$RuntimeBinding
    )

    if (-not $ProcessIdentity.MainProcessId -or
        -not $ProcessIdentity.MainProcessCreationDate -or
        -not $ProcessIdentity.CliServerPort -or
        -not $ProcessIdentity.AutomationPort) {
        throw 'Cannot write a session record without a complete DevTools process identity.'
    }
    $providedCreationValue = $ProcessIdentity.MainProcessCreationDate
    $normalizedCreationDate = ConvertTo-WeappUtcTimestamp -Value $providedCreationValue
    if (-not $normalizedCreationDate) {
        throw 'Cannot write a session record with an invalid DevTools process creation time.'
    }
    $liveMainProcesses = @(Get-CimInstance Win32_Process -Filter "ProcessId = $([uint32]$ProcessIdentity.MainProcessId)" -ErrorAction SilentlyContinue |
        Where-Object { [string]$_.Name -eq 'wechatdevtools.exe' })
    if ($liveMainProcesses.Count -eq 1) {
        $liveCreationValue = $liveMainProcesses[0].CreationDate
        $liveCreationDate = ConvertTo-WeappUtcTimestamp -Value $liveCreationValue
        if (-not $liveCreationDate -or $liveCreationDate -ne $normalizedCreationDate) {
            throw 'Cannot write a session record because the live DevTools process creation time does not match.'
        }
        $normalizedCreationDate = $liveCreationDate
    }
    if ($RuntimeBinding -notmatch '^[a-f0-9]{32}$') {
        throw 'Cannot write a session record without a valid AppService runtime binding.'
    }

    $recordDir = Split-Path -Parent $RecordPath
    New-Item -ItemType Directory -Force -Path $recordDir | Out-Null
    $payload = [ordered]@{
        schemaVersion = 3
        role = $Role
        projectDir = [IO.Path]::GetFullPath($ProjectDir)
        wsEndpoint = $WsEndpoint
        mainProcessId = [uint32]$ProcessIdentity.MainProcessId
        mainProcessCreationDate = $normalizedCreationDate
        cliServerPort = [int]$ProcessIdentity.CliServerPort
        cliServerProcessId = [uint32]$ProcessIdentity.CliServerProcessId
        automationPort = [int]$ProcessIdentity.AutomationPort
        automationProcessId = [uint32]$ProcessIdentity.AutomationProcessId
        runtimeBinding = $RuntimeBinding
        toolVersion = [string]$ToolInfo.version
        SDKVersion = [string]$ToolInfo.SDKVersion
        verifiedAt = [DateTime]::UtcNow.ToString('o')
    }
    $payload | ConvertTo-Json | Set-Content -LiteralPath $RecordPath -Encoding UTF8
}
