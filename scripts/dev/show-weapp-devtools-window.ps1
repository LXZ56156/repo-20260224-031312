[CmdletBinding()]
param(
    [ValidateSet('Inspect', 'Prepare', 'Restore')][string]$Mode = 'Inspect',
    [uint32]$ProcessId = 0,
    [string]$ProcessCreationDate = '',
    [long]$WindowHandle = 0,
    [ValidateRange(0, 11)][int]$OriginalShowCmd = 1,
    [long]$ForegroundWindowHandle = 0,
    [string]$SessionRecordPath = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = [IO.Path]::GetFullPath((Join-Path -Path $PSScriptRoot -ChildPath '..\..'))
$CommonScript = Join-Path -Path $PSScriptRoot -ChildPath 'weapp-powershell-common.ps1'
. $CommonScript
if (-not $SessionRecordPath) {
    $SessionRecordPath = Join-Path -Path $RepoRoot -ChildPath 'tmp\weapp-automation-session.json'
}

if (-not ('WeappScreenshotWindow' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WeappScreenshotWindow {
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct WINDOWPLACEMENT {
        public int length; public int flags; public int showCmd;
        public POINT ptMinPosition; public POINT ptMaxPosition; public RECT rcNormalPosition;
    }
    [DllImport("user32.dll")] public static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT placement);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);
    [DllImport("user32.dll", EntryPoint = "GetWindowThreadProcessId")] private static extern uint GetWindowThreadProcessIdWithOwner(IntPtr hWnd, out uint processId);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
    [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern IntPtr SetActiveWindow(IntPtr hWnd);

    public static uint GetWindowProcessId(IntPtr window) {
        uint processId;
        GetWindowThreadProcessIdWithOwner(window, out processId);
        return processId;
    }

    public static IntPtr FindMainWindow(uint processId) {
        IntPtr match = IntPtr.Zero;
        EnumWindows((window, _) => {
            if (!IsWindowVisible(window) || GetWindowProcessId(window) != processId) return true;
            int titleLength = GetWindowTextLength(window);
            if (titleLength <= 0) return true;
            var title = new StringBuilder(titleLength + 1);
            GetWindowText(window, title, title.Capacity);
            string value = title.ToString();
            bool isDevTools = value.IndexOf("\u5FAE\u4FE1\u5F00\u53D1\u8005\u5DE5\u5177", StringComparison.OrdinalIgnoreCase) >= 0 ||
                (value.IndexOf("WeChat", StringComparison.OrdinalIgnoreCase) >= 0 &&
                 value.IndexOf("DevTools", StringComparison.OrdinalIgnoreCase) >= 0);
            if (!isDevTools) return true;
            match = window;
            return false;
        }, IntPtr.Zero);
        return match;
    }

    public static bool ForceForegroundWindow(IntPtr target) {
        if (!IsWindow(target)) return false;
        IntPtr foreground = GetForegroundWindow();
        uint currentThread = GetCurrentThreadId();
        uint foregroundThread = GetWindowThreadProcessId(foreground, IntPtr.Zero);
        uint targetThread = GetWindowThreadProcessId(target, IntPtr.Zero);
        bool attachedForeground = false;
        bool attachedTarget = false;
        try {
            if (foregroundThread != 0 && foregroundThread != currentThread) {
                attachedForeground = AttachThreadInput(currentThread, foregroundThread, true);
            }
            if (targetThread != 0 && targetThread != currentThread && targetThread != foregroundThread) {
                attachedTarget = AttachThreadInput(currentThread, targetThread, true);
            }
            ShowWindowAsync(target, 5);
            BringWindowToTop(target);
            SetActiveWindow(target);
            return SetForegroundWindow(target);
        } finally {
            if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
            if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, false);
        }
    }
}
'@
}

function Get-WindowSnapshot {
    param([Parameter(Mandatory = $true)][IntPtr]$Handle)

    if (-not [WeappScreenshotWindow]::IsWindow($Handle)) { throw 'WeChat DevTools window handle is no longer valid.' }
    $placement = New-Object WeappScreenshotWindow+WINDOWPLACEMENT
    $placement.length = [Runtime.InteropServices.Marshal]::SizeOf($placement)
    if (-not [WeappScreenshotWindow]::GetWindowPlacement($Handle, [ref]$placement)) {
        throw 'WeChat DevTools window state could not be read.'
    }
    return [pscustomobject]@{
        ShowCmd = [int]$placement.showCmd
        ForegroundWindowHandle = [long][WeappScreenshotWindow]::GetForegroundWindow().ToInt64()
    }
}

function Get-TrackedDevToolsProcess {
    param(
        [Parameter(Mandatory = $true)][uint32]$ExpectedProcessId,
        [Parameter(Mandatory = $true)][string]$ExpectedCreationDate,
        [long]$ExpectedWindowHandle = 0
    )

    $candidates = @(Get-CimInstance Win32_Process -Filter "ProcessId = $ExpectedProcessId" -ErrorAction SilentlyContinue |
        Where-Object { [string]$_.Name -eq 'wechatdevtools.exe' })
    if ($candidates.Count -ne 1) { throw "The session-bound WeChat DevTools process is unavailable: PID=$ExpectedProcessId" }
    $actualCreationDate = ConvertTo-WeappUtcTimestamp -Value $candidates[0].CreationDate
    if (-not $actualCreationDate -or $actualCreationDate -ne $ExpectedCreationDate) {
        throw "The session-bound WeChat DevTools process creation time changed: PID=$ExpectedProcessId"
    }
    $process = Get-Process -Id $ExpectedProcessId -ErrorAction Stop
    if ($process.ProcessName -ne 'wechatdevtools') {
        throw "The session-bound WeChat DevTools process name changed: PID=$ExpectedProcessId"
    }
    if ($ExpectedWindowHandle -ne 0) {
        $expectedHandle = [IntPtr]::new($ExpectedWindowHandle)
        if (-not [WeappScreenshotWindow]::IsWindow($expectedHandle) -or
            [WeappScreenshotWindow]::GetWindowProcessId($expectedHandle) -ne $ExpectedProcessId) {
            throw "The session-bound WeChat DevTools window is unavailable or belongs to another process: PID=$ExpectedProcessId"
        }
    }
    return $process
}

if ($Mode -eq 'Restore') {
    if (-not $ProcessId -or -not $ProcessCreationDate -or -not $WindowHandle) {
        throw 'Restore requires the session-bound process id, creation date, and window handle.'
    }
    $process = Get-TrackedDevToolsProcess -ExpectedProcessId $ProcessId `
        -ExpectedCreationDate $ProcessCreationDate -ExpectedWindowHandle $WindowHandle
    $mainHandle = [IntPtr]::new($WindowHandle)
    $mainHandleValue = [long]$mainHandle.ToInt64()
    $foregroundBefore = [long][WeappScreenshotWindow]::GetForegroundWindow().ToInt64()
    $originalForegroundIsValid = $ForegroundWindowHandle -ne 0 -and
        [WeappScreenshotWindow]::IsWindow([IntPtr]::new($ForegroundWindowHandle))
    $foregroundBeforeIsValid = $foregroundBefore -ne 0 -and
        [WeappScreenshotWindow]::IsWindow([IntPtr]::new($foregroundBefore))
    $shouldRestoreForeground = $originalForegroundIsValid -and $foregroundBefore -eq $mainHandleValue
    $restoreForegroundHandle = 0
    $foregroundRestoreAction = if ($shouldRestoreForeground) {
        $restoreForegroundHandle = $ForegroundWindowHandle
        'restore-original'
    } elseif ($foregroundBeforeIsValid -and $foregroundBefore -ne $mainHandleValue) {
        $restoreForegroundHandle = $foregroundBefore
        'preserve-user-focus'
    } else {
        'original-window-unavailable'
    }
    $foregroundTargetIsValid = $restoreForegroundHandle -ne 0 -and
        [WeappScreenshotWindow]::IsWindow([IntPtr]::new($restoreForegroundHandle))

    $null = [WeappScreenshotWindow]::ShowWindowAsync($mainHandle, $OriginalShowCmd)
    Start-Sleep -Milliseconds 100
    $foregroundAfterRestore = [long][WeappScreenshotWindow]::GetForegroundWindow().ToInt64()
    $foregroundAfterIsUserWindow = $foregroundAfterRestore -ne 0 -and
        $foregroundAfterRestore -ne $mainHandleValue -and
        [WeappScreenshotWindow]::IsWindow([IntPtr]::new($foregroundAfterRestore))
    if ($foregroundAfterIsUserWindow -and $foregroundAfterRestore -ne $restoreForegroundHandle) {
        # The user changed focus while the restore was starting. Preserve the newest
        # user-selected window instead of pulling focus back to the earlier snapshot.
        $restoreForegroundHandle = $foregroundAfterRestore
        $foregroundTargetIsValid = $true
        $foregroundRestoreAction = 'preserve-user-focus'
    } elseif ($foregroundTargetIsValid -and $foregroundAfterRestore -eq $mainHandleValue) {
        $latestForeground = [long][WeappScreenshotWindow]::GetForegroundWindow().ToInt64()
        if ($latestForeground -eq $mainHandleValue) {
            $null = [WeappScreenshotWindow]::ForceForegroundWindow([IntPtr]::new($restoreForegroundHandle))
        }
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    do {
        Start-Sleep -Milliseconds 100
        $snapshot = Get-WindowSnapshot -Handle $mainHandle
        $currentForegroundIsUserWindow = $snapshot.ForegroundWindowHandle -ne 0 -and
            $snapshot.ForegroundWindowHandle -ne $mainHandleValue -and
            [WeappScreenshotWindow]::IsWindow([IntPtr]::new($snapshot.ForegroundWindowHandle))
        if ($currentForegroundIsUserWindow -and $snapshot.ForegroundWindowHandle -ne $restoreForegroundHandle) {
            # Treat a newly selected non-DevTools foreground as the latest user intent.
            $restoreForegroundHandle = $snapshot.ForegroundWindowHandle
            $foregroundRestoreAction = 'preserve-user-focus'
        }
        $foregroundTargetIsValid = $restoreForegroundHandle -ne 0 -and
            [WeappScreenshotWindow]::IsWindow([IntPtr]::new($restoreForegroundHandle))
        if (-not $foregroundTargetIsValid -and $foregroundRestoreAction -ne 'original-window-unavailable') {
            $foregroundRestoreAction = 'original-window-unavailable'
        }
        $windowStateRestored = $snapshot.ShowCmd -eq $OriginalShowCmd
        $foregroundRestored = $foregroundTargetIsValid -and
            $snapshot.ForegroundWindowHandle -eq $restoreForegroundHandle
        $foregroundSafe = if ($foregroundTargetIsValid) {
            $foregroundRestored
        } else {
            $snapshot.ForegroundWindowHandle -ne $mainHandleValue
        }
        if ($windowStateRestored -and $foregroundSafe) { break }
        if ($foregroundTargetIsValid -and $snapshot.ForegroundWindowHandle -eq $mainHandleValue) {
            $latestForeground = [long][WeappScreenshotWindow]::GetForegroundWindow().ToInt64()
            if ($latestForeground -eq $mainHandleValue) {
                $null = [WeappScreenshotWindow]::ForceForegroundWindow([IntPtr]::new($restoreForegroundHandle))
            } elseif ($latestForeground -ne 0 -and
                [WeappScreenshotWindow]::IsWindow([IntPtr]::new($latestForeground))) {
                $restoreForegroundHandle = $latestForeground
                $foregroundRestoreAction = 'preserve-user-focus'
            }
        }
    } while ([DateTime]::UtcNow -lt $deadline)

    if (-not $windowStateRestored) {
        throw "WeChat DevTools window state was not restored to showCmd=$OriginalShowCmd"
    }
    if (-not $foregroundSafe) { throw 'WeChat DevTools remained in the foreground after window restoration.' }
    [ordered]@{
        processId = [uint32]$process.Id
        processCreationDate = $ProcessCreationDate
        windowHandle = $mainHandleValue
        windowStateRestored = $true
        originalShowCmd = $OriginalShowCmd
        restoredShowCmd = [int]$snapshot.ShowCmd
        foregroundRestoreAction = $foregroundRestoreAction
        foregroundRestored = [bool]$foregroundRestored
        foregroundSafe = [bool]$foregroundSafe
        userFocusPreserved = [bool]($foregroundRestoreAction -eq 'preserve-user-focus' -and $foregroundRestored)
        finalForegroundWindowHandle = [long]$snapshot.ForegroundWindowHandle
    } | ConvertTo-Json -Compress
    exit 0
}

if (-not (Test-WeappSessionRecord -RecordPath $SessionRecordPath -ProjectDir $RepoRoot `
    -WsEndpoint 'ws://127.0.0.1:39420' -Role 'source' -CliPort 39421)) {
    throw "The schema-v3 automation session record is missing, stale, or no longer matches runtime/ports 39420/39421: $SessionRecordPath"
}
$record = Get-Content -Raw -LiteralPath $SessionRecordPath | ConvertFrom-Json
$process = Get-TrackedDevToolsProcess -ExpectedProcessId ([uint32]$record.mainProcessId) `
    -ExpectedCreationDate ([string]$record.mainProcessCreationDate)
$mainHandle = [WeappScreenshotWindow]::FindMainWindow([uint32]$process.Id)
if ($mainHandle.ToInt64() -eq 0) {
    throw "The titled WeChat DevTools main window is unavailable: PID=$($process.Id)"
}
$mainHandleValue = [long]$mainHandle.ToInt64()
$initial = Get-WindowSnapshot -Handle $mainHandle

if ($Mode -eq 'Prepare') {
    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    do {
        $null = [WeappScreenshotWindow]::ShowWindowAsync($mainHandle, 3)
        $null = [WeappScreenshotWindow]::SetForegroundWindow($mainHandle)
        Start-Sleep -Milliseconds 50
        if ([long][WeappScreenshotWindow]::GetForegroundWindow().ToInt64() -ne $mainHandleValue) {
            $null = [WeappScreenshotWindow]::ForceForegroundWindow($mainHandle)
        }
        Start-Sleep -Milliseconds 100
        $prepared = Get-WindowSnapshot -Handle $mainHandle
        $windowPrepared = $prepared.ShowCmd -eq 3 -and
            $prepared.ForegroundWindowHandle -eq $mainHandleValue
        if ($windowPrepared) { break }
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $windowPrepared) { throw 'WeChat DevTools could not be maximized and focused for screenshot capture.' }
} else {
    $prepared = $initial
    $windowPrepared = $false
}

[ordered]@{
    processId = [uint32]$process.Id
    processCreationDate = [string]$record.mainProcessCreationDate
    windowHandle = $mainHandleValue
    originalShowCmd = [int]$initial.ShowCmd
    foregroundWindowHandle = [long]$initial.ForegroundWindowHandle
    preparedShowCmd = [int]$prepared.ShowCmd
    preparedForegroundVerified = [bool]($prepared.ForegroundWindowHandle -eq $mainHandleValue)
    windowPrepared = [bool]$windowPrepared
} | ConvertTo-Json -Compress
exit 0
