$ErrorActionPreference = 'Stop'

$CliPath = 'D:\Soft\微信web开发者工具\cli.bat'
$PreviewDir = 'D:\projects\badminton-miniapp-preview'
$CliPort = 39421
$AutoPort = 39420
$OpenTimeoutSeconds = 45
$AutoTimeoutSeconds = 45
$OpenRetries = 2
$AutoRetries = 2

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

function Invoke-CliCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [int]$TimeoutSeconds = 30,

        [int]$Retries = 1,

        [int]$RetryDelaySeconds = 2,

        [switch]$IgnoreFailure
    )

    for ($attempt = 1; $attempt -le $Retries; $attempt++) {
        Write-Log ("CLI attempt {0}/{1}: {2}" -f $attempt, $Retries, ($Arguments -join ' '))
        $process = Start-Process -FilePath $CliPath -ArgumentList $Arguments -WorkingDirectory $PreviewDir -PassThru
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            try {
                $process.Kill()
            } catch {
                # ignore
            }

            if ($attempt -lt $Retries) {
                Write-Log ("CLI timed out after {0}s, retrying in {1}s" -f $TimeoutSeconds, $RetryDelaySeconds)
                Start-Sleep -Seconds $RetryDelaySeconds
                continue
            }

            if ($IgnoreFailure) {
                Write-Log ("忽略 CLI 超时：{0}" -f ($Arguments -join ' '))
                return
            }

            throw ("CLI 执行超时：{0}" -f ($Arguments -join ' '))
        }

        if ($process.ExitCode -eq 0) {
            return
        }

        if ($attempt -lt $Retries) {
            Write-Log ("CLI exited with code {0}, retrying in {1}s" -f $process.ExitCode, $RetryDelaySeconds)
            Start-Sleep -Seconds $RetryDelaySeconds
            continue
        }

        if ($IgnoreFailure) {
            Write-Log (("忽略 CLI 失败：{0} (exit={1})" -f ($Arguments -join ' '), $process.ExitCode))
            return
        }

        throw (("CLI 执行失败：{0} (exit={1})" -f ($Arguments -join ' '), $process.ExitCode))
    }
}

function Start-CliCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Log ("启动 CLI: {0}" -f ($Arguments -join ' '))
    Start-Process -FilePath $CliPath -ArgumentList $Arguments -WorkingDirectory $PreviewDir | Out-Null
}

function Wait-ForAutomationPort {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
            if ($async.AsyncWaitHandle.WaitOne(1000) -and $client.Connected) {
                $client.Close()
                return $true
            }
            $client.Close()
        } catch {
            # ignore
        }
        Start-Sleep -Milliseconds 800
    }
    return $false
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
Write-Log "CLI_PORT: $CliPort"
Write-Log "PORT: $AutoPort"
Write-Log "启动顺序：quit -> open -> auto"

Push-Location -LiteralPath $PreviewDir
try {
    Write-Log ("WORKDIR: {0}" -f (Get-Location))
    Invoke-CliCommand -Arguments @('quit') -TimeoutSeconds 15 -Retries 1 -IgnoreFailure
    Start-Sleep -Seconds 1
    Start-CliCommand -Arguments @('open', '--project', $PreviewDir)
    Start-Sleep -Seconds 4
    Start-CliCommand -Arguments @('auto', '--project', $PreviewDir, '--port', [string]$CliPort, '--auto-port', [string]$AutoPort)
    if (Wait-ForAutomationPort -Port $AutoPort -TimeoutSeconds $AutoTimeoutSeconds) {
        Write-Log ("automation 已就绪：ws://127.0.0.1:{0}" -f $AutoPort)
    } else {
        Write-Log ("WARN: automation port not ready within {0}s: {1}" -f $AutoTimeoutSeconds, $AutoPort)
    }
} finally {
    Pop-Location
}

exit 0
