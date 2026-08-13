param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Inspect', 'Capture')]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [string]$RequestPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing.dll' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace Codex.WeappCapture {
  public sealed class WindowEvidence {
    public long Hwnd { get; set; }
    public uint ProcessId { get; set; }
    public string Title { get; set; }
    public string ClassName { get; set; }
    public bool Visible { get; set; }
    public bool Minimized { get; set; }
    public bool Cloaked { get; set; }
    public int CloakState { get; set; }
    public string DesktopId { get; set; }
    public bool IsOnCurrentVirtualDesktop { get; set; }
    public int Dpi { get; set; }
    public Rectangle WindowRect { get; set; }
    public Rectangle RawWindowRect { get; set; }
    public long ExStyle { get; set; }
    public bool LayeredAttributesAvailable { get; set; }
    public uint LayeredColorKey { get; set; }
    public byte LayeredAlpha { get; set; }
    public uint LayeredFlags { get; set; }
  }

  public sealed class BitmapEvidence {
    public string Path { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public long ByteLength { get; set; }
    public string Sha256 { get; set; }
    public string PixelSha256 { get; set; }
    public string FrameRegionPixelSha256 { get; set; }
    public bool CropMatchesFrameRegion { get; set; }
    public double NonBlackPixelRatio { get; set; }
    public int DistinctColorCount { get; set; }
    public bool LikelyBlackFrame { get; set; }
  }

  public sealed class PixelProbeEvidence {
    public int X { get; set; }
    public int Y { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public string PixelSha256 { get; set; }
    public double SurfaceRatio { get; set; }
    public double OverlayDarkRatio { get; set; }
    public double DeepGreenRatio { get; set; }
    public double WinnerSoftRatio { get; set; }
    public double LoserSoftRatio { get; set; }
  }

  public static class NativeCapture {
    public const long WS_EX_LAYERED = 0x00080000L;
    public const long WS_EX_TRANSPARENT = 0x00000020L;
    private const int DwmExtendedFrameBounds = 9;
    private const int DwmCloaked = 14;
    private const uint PwRenderFullContent = 2;
    private const int GwlExStyle = -20;

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect {
      public int Left;
      public int Top;
      public int Right;
      public int Bottom;
    }

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [ComImport]
    [Guid("a5cd92ff-29be-454c-8d04-d82879fb3f1b")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IVirtualDesktopManager {
      [return: MarshalAs(UnmanagedType.Bool)]
      bool IsWindowOnCurrentVirtualDesktop(IntPtr topLevelWindow);
      Guid GetWindowDesktopId(IntPtr topLevelWindow);
      void Reserved(IntPtr topLevelWindow, [MarshalAs(UnmanagedType.LPStruct)] Guid desktopId);
    }

    [ComImport]
    [Guid("aa509086-5ca9-4c25-8f95-589d3c07b48a")]
    private class VirtualDesktopManagerCom { }

    private static readonly IVirtualDesktopManager VirtualDesktopManager =
      (IVirtualDesktopManager)new VirtualDesktopManagerCom();

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);

    [DllImport("shcore.dll")]
    private static extern int SetProcessDpiAwareness(int awareness);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hwnd, out NativeRect rect);

    [DllImport("user32.dll")]
    private static extern int GetWindowTextLength(IntPtr hwnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hwnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hwnd);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hwnd, int index);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW", SetLastError = true)]
    private static extern int GetWindowLong32(IntPtr hwnd, int index);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetLayeredWindowAttributes(
      IntPtr hwnd,
      out uint colorKey,
      out byte alpha,
      out uint flags
    );

    [DllImport("user32.dll", EntryPoint = "PrintWindow")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RenderWindow(IntPtr hwnd, IntPtr targetDc, uint flags);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out NativeRect value, int size);

    [DllImport("dwmapi.dll", EntryPoint = "DwmGetWindowAttribute")]
    private static extern int DwmGetWindowAttributeInt(IntPtr hwnd, int attribute, out int value, int size);

    public static string EnableDpiAwareness() {
      try {
        if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return "per-monitor-aware-v2";
      } catch (EntryPointNotFoundException) {
      } catch (DllNotFoundException) {
      }
      try {
        if (SetProcessDpiAwareness(2) == 0) return "per-monitor-aware";
      } catch (EntryPointNotFoundException) {
      } catch (DllNotFoundException) {
      }
      try {
        if (SetProcessDPIAware()) return "system-aware";
      } catch { }
      return "unknown";
    }

    private static Rectangle ToRectangle(NativeRect value) {
      return Rectangle.FromLTRB(value.Left, value.Top, value.Right, value.Bottom);
    }

    private static string ReadTitle(IntPtr hwnd) {
      int length = Math.Max(GetWindowTextLength(hwnd) + 1, 2);
      StringBuilder value = new StringBuilder(length);
      GetWindowText(hwnd, value, value.Capacity);
      return value.ToString();
    }

    private static string ReadClassName(IntPtr hwnd) {
      StringBuilder value = new StringBuilder(512);
      GetClassName(hwnd, value, value.Capacity);
      return value.ToString();
    }

    private static int ReadCloakState(IntPtr hwnd) {
      int value;
      try {
        return DwmGetWindowAttributeInt(hwnd, DwmCloaked, out value, sizeof(int)) == 0 ? value : 0;
      } catch { return 0; }
    }

    private static string ReadDesktopId(IntPtr hwnd) {
      try { return VirtualDesktopManager.GetWindowDesktopId(hwnd).ToString("D"); }
      catch { return String.Empty; }
    }

    private static bool ReadIsOnCurrentVirtualDesktop(IntPtr hwnd) {
      try { return VirtualDesktopManager.IsWindowOnCurrentVirtualDesktop(hwnd); }
      catch { return false; }
    }

    private static long ReadExStyle(IntPtr hwnd) {
      return IntPtr.Size == 8
        ? GetWindowLongPtr64(hwnd, GwlExStyle).ToInt64()
        : GetWindowLong32(hwnd, GwlExStyle);
    }

    public static WindowEvidence InspectWindow(IntPtr hwnd) {
      uint processId;
      GetWindowThreadProcessId(hwnd, out processId);
      NativeRect raw;
      if (!GetWindowRect(hwnd, out raw)) throw new InvalidOperationException("GetWindowRect failed.");
      NativeRect extended;
      Rectangle windowRect = ToRectangle(raw);
      try {
        if (DwmGetWindowAttribute(hwnd, DwmExtendedFrameBounds, out extended, Marshal.SizeOf(typeof(NativeRect))) == 0) {
          Rectangle candidate = ToRectangle(extended);
          if (candidate.Width > 0 && candidate.Height > 0) windowRect = candidate;
        }
      } catch { }
      int dpi = 0;
      try { dpi = checked((int)GetDpiForWindow(hwnd)); } catch { }
      if (dpi <= 0) dpi = 96;
      int cloakState = ReadCloakState(hwnd);
      uint layeredColorKey;
      byte layeredAlpha;
      uint layeredFlags;
      bool layeredAttributesAvailable = GetLayeredWindowAttributes(
        hwnd,
        out layeredColorKey,
        out layeredAlpha,
        out layeredFlags
      );
      return new WindowEvidence {
        Hwnd = hwnd.ToInt64(),
        ProcessId = processId,
        Title = ReadTitle(hwnd),
        ClassName = ReadClassName(hwnd),
        Visible = IsWindowVisible(hwnd),
        Minimized = IsIconic(hwnd),
        Cloaked = cloakState != 0,
        CloakState = cloakState,
        DesktopId = ReadDesktopId(hwnd),
        IsOnCurrentVirtualDesktop = ReadIsOnCurrentVirtualDesktop(hwnd),
        Dpi = dpi,
        WindowRect = windowRect,
        RawWindowRect = ToRectangle(raw),
        ExStyle = ReadExStyle(hwnd),
        LayeredAttributesAvailable = layeredAttributesAvailable,
        LayeredColorKey = layeredColorKey,
        LayeredAlpha = layeredAlpha,
        LayeredFlags = layeredFlags
      };
    }

    public static List<WindowEvidence> EnumerateWindows() {
      List<WindowEvidence> result = new List<WindowEvidence>();
      EnumWindows(delegate(IntPtr hwnd, IntPtr ignored) {
        try { result.Add(InspectWindow(hwnd)); } catch { }
        return true;
      }, IntPtr.Zero);
      return result;
    }

    public static List<WindowEvidence> EnumerateWindowsAbove(IntPtr target) {
      List<WindowEvidence> result = new List<WindowEvidence>();
      bool reachedTarget = false;
      EnumWindows(delegate(IntPtr hwnd, IntPtr ignored) {
        if (hwnd == target) {
          reachedTarget = true;
          return false;
        }
        try { result.Add(InspectWindow(hwnd)); } catch { }
        return true;
      }, IntPtr.Zero);
      if (!reachedTarget) throw new InvalidOperationException("Bound HWND was not found in top-level Z order.");
      return result;
    }

    private static string FileSha256(string path) {
      using (SHA256 sha = SHA256.Create())
      using (FileStream stream = File.OpenRead(path)) {
        return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
      }
    }

    private static string PixelSha256(Bitmap source) {
      Rectangle bounds = new Rectangle(0, 0, source.Width, source.Height);
      using (Bitmap normalized = source.Clone(bounds, PixelFormat.Format32bppArgb)) {
        BitmapData data = normalized.LockBits(bounds, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try {
          int rowBytes = checked(normalized.Width * 4);
          byte[] pixels = new byte[checked(rowBytes * normalized.Height)];
          byte[] row = new byte[rowBytes];
          for (int y = 0; y < normalized.Height; y++) {
            IntPtr sourceRow = IntPtr.Add(data.Scan0, checked(y * data.Stride));
            Marshal.Copy(sourceRow, row, 0, rowBytes);
            Buffer.BlockCopy(row, 0, pixels, checked(y * rowBytes), rowBytes);
          }
          using (SHA256 sha = SHA256.Create()) {
            return BitConverter.ToString(sha.ComputeHash(pixels)).Replace("-", "").ToLowerInvariant();
          }
        } finally {
          normalized.UnlockBits(data);
        }
      }
    }

    private static void ValidateFrameGeometry(Rectangle windowRect, Rectangle viewportRect) {
      if (windowRect.Width <= 0 || windowRect.Height <= 0) throw new ArgumentOutOfRangeException("windowRect");
      if (viewportRect.X < 0 || viewportRect.Y < 0
          || viewportRect.Right > windowRect.Width || viewportRect.Bottom > windowRect.Height) {
        throw new ArgumentOutOfRangeException("viewportRect");
      }
    }

    private static void AnalyzeFrame(
      Bitmap source,
      out double nonBlackPixelRatio,
      out int distinctColorCount,
      out bool likelyBlackFrame
    ) {
      Rectangle bounds = new Rectangle(0, 0, source.Width, source.Height);
      using (Bitmap normalized = source.Clone(bounds, PixelFormat.Format32bppArgb)) {
        BitmapData data = normalized.LockBits(bounds, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try {
          long nonBlack = 0;
          long total = checked((long)normalized.Width * normalized.Height);
          HashSet<int> colors = new HashSet<int>();
          byte[] row = new byte[checked(normalized.Width * 4)];
          for (int y = 0; y < normalized.Height; y++) {
            Marshal.Copy(IntPtr.Add(data.Scan0, checked(y * data.Stride)), row, 0, row.Length);
            for (int x = 0; x < normalized.Width; x++) {
              int offset = x * 4;
              int blue = row[offset];
              int green = row[offset + 1];
              int red = row[offset + 2];
              if (red > 12 || green > 12 || blue > 12) nonBlack++;
              if (colors.Count < 4096) colors.Add((red << 16) | (green << 8) | blue);
            }
          }
          nonBlackPixelRatio = total > 0 ? (double)nonBlack / total : 0;
          distinctColorCount = colors.Count;
          likelyBlackFrame = nonBlackPixelRatio < 0.005 || distinctColorCount < 8;
        } finally {
          normalized.UnlockBits(data);
        }
      }
    }

    private static BitmapEvidence PersistFrameAndCrop(
      Bitmap fullFrame,
      Rectangle viewportRect,
      string fullFramePath,
      string cropPath
    ) {
      Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(fullFramePath)));
      Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(cropPath)));
      double nonBlackPixelRatio;
      int distinctColorCount;
      bool likelyBlackFrame;
      AnalyzeFrame(fullFrame, out nonBlackPixelRatio, out distinctColorCount, out likelyBlackFrame);
      string frameRegionPixelHash;
      fullFrame.Save(fullFramePath, ImageFormat.Png);
      using (Bitmap crop = fullFrame.Clone(viewportRect, PixelFormat.Format32bppArgb)) {
        frameRegionPixelHash = PixelSha256(crop);
        crop.Save(cropPath, ImageFormat.Png);
      }
      string cropPixelHash;
      using (Bitmap persistedCrop = new Bitmap(cropPath)) {
        cropPixelHash = PixelSha256(persistedCrop);
      }
      return new BitmapEvidence {
        Path = Path.GetFullPath(cropPath),
        Width = viewportRect.Width,
        Height = viewportRect.Height,
        ByteLength = new FileInfo(cropPath).Length,
        Sha256 = FileSha256(cropPath),
        PixelSha256 = cropPixelHash,
        FrameRegionPixelSha256 = frameRegionPixelHash,
        CropMatchesFrameRegion = String.Equals(cropPixelHash, frameRegionPixelHash, StringComparison.OrdinalIgnoreCase),
        NonBlackPixelRatio = nonBlackPixelRatio,
        DistinctColorCount = distinctColorCount,
        LikelyBlackFrame = likelyBlackFrame
      };
    }

    public static BitmapEvidence CaptureVisibleFrame(
      Rectangle windowRect,
      Rectangle viewportRect,
      string fullFramePath,
      string cropPath
    ) {
      ValidateFrameGeometry(windowRect, viewportRect);
      using (Bitmap fullFrame = new Bitmap(windowRect.Width, windowRect.Height, PixelFormat.Format32bppArgb)) {
        using (Graphics graphics = Graphics.FromImage(fullFrame)) {
          graphics.CopyFromScreen(
            windowRect.X,
            windowRect.Y,
            0,
            0,
            windowRect.Size,
            CopyPixelOperation.SourceCopy
          );
        }
        return PersistFrameAndCrop(fullFrame, viewportRect, fullFramePath, cropPath);
      }
    }

    public static BitmapEvidence CapturePrintWindowFrame(
      IntPtr hwnd,
      Rectangle windowRect,
      Rectangle viewportRect,
      string fullFramePath,
      string cropPath
    ) {
      ValidateFrameGeometry(windowRect, viewportRect);
      using (Bitmap fullFrame = new Bitmap(windowRect.Width, windowRect.Height, PixelFormat.Format32bppArgb)) {
        bool rendered;
        using (Graphics graphics = Graphics.FromImage(fullFrame)) {
          graphics.Clear(Color.Black);
          IntPtr targetDc = graphics.GetHdc();
          try {
            rendered = RenderWindow(hwnd, targetDc, PwRenderFullContent);
          } finally {
            graphics.ReleaseHdc(targetDc);
          }
        }
        if (!rendered) throw new InvalidOperationException("PrintWindow(PW_RENDERFULLCONTENT) returned false.");
        return PersistFrameAndCrop(fullFrame, viewportRect, fullFramePath, cropPath);
      }
    }

    public static BitmapEvidence InspectFullFrame(string fullFramePath, int width, int height, string pixelSha256) {
      return new BitmapEvidence {
        Path = Path.GetFullPath(fullFramePath),
        Width = width,
        Height = height,
        ByteLength = new FileInfo(fullFramePath).Length,
        Sha256 = FileSha256(fullFramePath),
        PixelSha256 = pixelSha256
      };
    }

    public static string ReadBitmapPixelSha256(string path) {
      using (Bitmap bitmap = new Bitmap(path)) return PixelSha256(bitmap);
    }

    public static PixelProbeEvidence InspectPixelProbe(string path, int x, int y, int width, int height) {
      using (Bitmap bitmap = new Bitmap(path)) {
        Rectangle rect = new Rectangle(x, y, width, height);
        if (rect.X < 0 || rect.Y < 0 || rect.Right > bitmap.Width || rect.Bottom > bitmap.Height
            || rect.Width <= 0 || rect.Height <= 0) {
          throw new InvalidOperationException("pixel probe rectangle is outside the viewport crop");
        }
        long total = (long)rect.Width * rect.Height;
        long surface = 0, dark = 0, green = 0, winner = 0, loser = 0;
        using (Bitmap region = bitmap.Clone(rect, PixelFormat.Format32bppArgb)) {
          for (int py = 0; py < region.Height; py++) {
            for (int px = 0; px < region.Width; px++) {
              Color color = region.GetPixel(px, py);
              int r = color.R, g = color.G, b = color.B;
              if (r >= 225 && g >= 225 && b >= 225) surface++;
              if ((r * 299 + g * 587 + b * 114) / 1000 < 190) dark++;
              if (r < 90 && g >= 35 && g <= 145 && b < 130 && g > r) green++;
              if (r >= 215 && g >= 225 && b >= 220 && g >= r + 3 && g >= b + 2) winner++;
              if (r >= 225 && g >= 205 && b >= 205 && r >= g + 3 && r >= b + 3) loser++;
            }
          }
          return new PixelProbeEvidence {
            X = x, Y = y, Width = width, Height = height,
            PixelSha256 = PixelSha256(region),
            SurfaceRatio = (double)surface / total,
            OverlayDarkRatio = (double)dark / total,
            DeepGreenRatio = (double)green / total,
            WinnerSoftRatio = (double)winner / total,
            LoserSoftRatio = (double)loser / total
          };
        }
      }
    }
  }
}
'@

function Convert-ToHwnd([object]$Value) {
  $source = [string]$Value
  if ([string]::IsNullOrWhiteSpace($source)) { return [IntPtr]::Zero }
  if ($source.StartsWith('0x', [StringComparison]::OrdinalIgnoreCase)) {
    return [IntPtr]([Convert]::ToInt64($source.Substring(2), 16))
  }
  return [IntPtr]([Convert]::ToInt64($source, 10))
}

function Format-Hwnd([IntPtr]$Value) {
  return ('0x{0:X}' -f $Value.ToInt64())
}

function Convert-Rect([Drawing.Rectangle]$Rect) {
  return [ordered]@{
    x = $Rect.X
    y = $Rect.Y
    width = $Rect.Width
    height = $Rect.Height
  }
}

function Convert-RequestRect([object]$Rect) {
  return [Drawing.Rectangle]::new(
    [int]$Rect.x,
    [int]$Rect.y,
    [int]$Rect.width,
    [int]$Rect.height
  )
}

function Test-SameRect([Drawing.Rectangle]$Left, [Drawing.Rectangle]$Right) {
  return $Left.X -eq $Right.X `
    -and $Left.Y -eq $Right.Y `
    -and $Left.Width -eq $Right.Width `
    -and $Left.Height -eq $Right.Height
}

function Resolve-CaptureMode([object]$Request) {
  $captureMode = [string]$Request.captureMode
  if ($captureMode -notin @('visible', 'printwindow', 'printwindow-current')) {
    throw "Unsupported captureMode: $captureMode"
  }
  return $captureMode
}

function Test-WindowReady(
  [object]$Window,
  [string]$CaptureMode,
  [bool]$TransparentTargetRequested = $false
) {
  if (-not $Window.Visible -or $Window.Minimized) { return $false }
  if ($CaptureMode -eq 'visible' -or $CaptureMode -eq 'printwindow-current') {
    if ($CaptureMode -eq 'printwindow-current' -and $TransparentTargetRequested) {
      $transparent = Convert-TransparentTargetEvidence $Window
      return -not $Window.Cloaked -and [bool]$transparent.eligible
    }
    return -not $Window.Cloaked -and [bool]$Window.IsOnCurrentVirtualDesktop
  }
  return -not [bool]$Window.IsOnCurrentVirtualDesktop
}

function Convert-WindowEvidence([object]$Window) {
  return [ordered]@{
    hwnd = Format-Hwnd ([IntPtr]$Window.Hwnd)
    processId = [int]$Window.ProcessId
    title = [string]$Window.Title
    className = [string]$Window.ClassName
    visible = [bool]$Window.Visible
    minimized = [bool]$Window.Minimized
    cloaked = [bool]$Window.Cloaked
    cloakState = [int]$Window.CloakState
    desktopId = [string]$Window.DesktopId
    isOnCurrentVirtualDesktop = [bool]$Window.IsOnCurrentVirtualDesktop
    dpi = [int]$Window.Dpi
    windowRect = Convert-Rect $Window.WindowRect
    rawWindowRect = Convert-Rect $Window.RawWindowRect
    exStyle = [long]$Window.ExStyle
    layeredAttributesAvailable = [bool]$Window.LayeredAttributesAvailable
    layeredColorKey = [uint32]$Window.LayeredColorKey
    layeredAlpha = [byte]$Window.LayeredAlpha
    layeredFlags = [uint32]$Window.LayeredFlags
  }
}

function Convert-TransparentTargetEvidence([object]$Window) {
  $layered = (([long]$Window.ExStyle -band [long]0x00080000) -ne 0)
  $clickThrough = (([long]$Window.ExStyle -band [long]0x00000020) -ne 0)
  $alphaZero = [bool]$Window.LayeredAttributesAvailable `
    -and [byte]$Window.LayeredAlpha -eq 0 `
    -and (([uint32]$Window.LayeredFlags -band [uint32]0x00000002) -ne 0)
  [ordered]@{
    eligible = [bool]($layered -and $clickThrough -and $alphaZero)
    exStyle = [long]$Window.ExStyle
    layered = [bool]$layered
    clickThrough = [bool]$clickThrough
    layeredAttributesAvailable = [bool]$Window.LayeredAttributesAvailable
    alphaZero = [bool]$alphaZero
    layeredColorKey = [uint32]$Window.LayeredColorKey
    layeredAlpha = [byte]$Window.LayeredAlpha
    layeredFlags = [uint32]$Window.LayeredFlags
  }
}

function Test-SameTransparentTargetEvidence([object]$Left, [object]$Right) {
  return (
    [bool]$Left.eligible -and [bool]$Right.eligible `
    -and [long]$Left.exStyle -eq [long]$Right.exStyle `
    -and [bool]$Left.layeredAttributesAvailable -eq [bool]$Right.layeredAttributesAvailable `
    -and [uint32]$Left.layeredColorKey -eq [uint32]$Right.layeredColorKey `
    -and [byte]$Left.layeredAlpha -eq [byte]$Right.layeredAlpha `
    -and [uint32]$Left.layeredFlags -eq [uint32]$Right.layeredFlags
  )
}

function Wait-TransparentCurrentCaptureReadiness(
  [IntPtr]$TargetHwnd,
  [int]$TargetProcessId,
  [Drawing.Rectangle]$ExpectedWindowRect,
  [object]$BaselineTransparent,
  [int]$Attempts = 60,
  [int]$DelayMilliseconds = 100
) {
  if ($Attempts -le 0) { throw 'Transparent current capture readiness Attempts must be positive.' }
  if ($DelayMilliseconds -lt 0) { throw 'Transparent current capture readiness delay cannot be negative.' }
  $lastDiagnostic = $null
  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    $candidate = [Codex.WeappCapture.NativeCapture]::InspectWindow($TargetHwnd)
    $candidateTransparent = Convert-TransparentTargetEvidence $candidate
    $foregroundHwnd = [Codex.WeappCapture.NativeCapture]::GetForegroundWindow()
    $foreground = $null
    $foregroundError = ''
    try {
      if ($foregroundHwnd -eq [IntPtr]::Zero) { throw 'foreground HWND is zero' }
      $foreground = [Codex.WeappCapture.NativeCapture]::InspectWindow($foregroundHwnd)
    } catch {
      $foregroundError = $_.Exception.Message
    }

    $sameHwnd = ([IntPtr]$candidate.Hwnd -eq $TargetHwnd)
    $sameProcessId = ([int]$candidate.ProcessId -eq $TargetProcessId)
    $geometryStable = Test-SameRect $candidate.WindowRect $ExpectedWindowRect
    $transparentStable = Test-SameTransparentTargetEvidence $BaselineTransparent $candidateTransparent
    $foregroundEvidenceAvailable = ($null -ne $foreground)
    $targetNeverForeground = $foregroundEvidenceAvailable `
      -and ($foregroundHwnd -ne $TargetHwnd) `
      -and ([int]$foreground.ProcessId -ne $TargetProcessId)
    $visibleAndRestored = [bool]$candidate.Visible -and -not [bool]$candidate.Minimized
    $cloakStateZero = -not [bool]$candidate.Cloaked -and [int]$candidate.CloakState -eq 0
    $predicates = [ordered]@{
      sameHwnd = [bool]$sameHwnd
      sameProcessId = [bool]$sameProcessId
      geometryStable = [bool]$geometryStable
      transparentEligible = [bool]$candidateTransparent.eligible
      transparentStable = [bool]$transparentStable
      foregroundEvidenceAvailable = [bool]$foregroundEvidenceAvailable
      targetNeverForeground = [bool]$targetNeverForeground
      visibleAndRestored = [bool]$visibleAndRestored
      cloakStateZero = [bool]$cloakStateZero
    }
    $lastDiagnostic = [ordered]@{
      attempt = $attempt
      attempts = $Attempts
      lastWindow = Convert-WindowEvidence $candidate
      transparent = $candidateTransparent
      foregroundHwnd = Format-Hwnd $foregroundHwnd
      foregroundProcessId = if ($foregroundEvidenceAvailable) { [int]$foreground.ProcessId } else { 0 }
      foregroundError = $foregroundError
      predicates = $predicates
    }
    $invariantsReady = $sameHwnd `
      -and $sameProcessId `
      -and $geometryStable `
      -and $transparentStable `
      -and $targetNeverForeground `
      -and $visibleAndRestored
    if (-not $invariantsReady) {
      $diagnostic = $lastDiagnostic | ConvertTo-Json -Depth 8 -Compress
      throw "Transparent current capture readiness invariant failed before PrintWindow: $diagnostic"
    }
    if ($cloakStateZero) {
      return [ordered]@{
        window = $candidate
        transparent = $candidateTransparent
        foreground = $foreground
        predicates = $predicates
        attempt = $attempt
      }
    }
    if ($attempt -lt $Attempts) { Start-Sleep -Milliseconds $DelayMilliseconds }
  }
  $timeoutDiagnostic = $lastDiagnostic | ConvertTo-Json -Depth 8 -Compress
  throw "Transparent current capture readiness timed out before PrintWindow after $Attempts attempts: $timeoutDiagnostic"
}

function Resolve-BoundWindow([object]$Request) {
  $captureMode = Resolve-CaptureMode $Request
  $requestedProcessId = [int]$Request.processId
  if ($requestedProcessId -le 0) { throw 'processId must be positive.' }
  $requestedHwnd = Convert-ToHwnd $Request.hwnd
  if ($requestedHwnd -ne [IntPtr]::Zero) {
    $window = [Codex.WeappCapture.NativeCapture]::InspectWindow($requestedHwnd)
    if ([int]$window.ProcessId -ne $requestedProcessId) {
      throw "HWND process does not match bound processId."
    }
    return $window
  }
  $titleIncludes = [string]$Request.expectedTitleIncludes
  $matches = @([Codex.WeappCapture.NativeCapture]::EnumerateWindows() | Where-Object {
    [int]$_.ProcessId -eq $requestedProcessId `
      -and $_.Visible `
      -and -not $_.Minimized `
      -and ($captureMode -eq 'printwindow' -or -not $_.Cloaked) `
      -and (($captureMode -eq 'visible' -and [bool]$_.IsOnCurrentVirtualDesktop) `
        -or ($captureMode -eq 'printwindow-current' -and [bool]$_.IsOnCurrentVirtualDesktop) `
        -or ($captureMode -eq 'printwindow' -and -not [bool]$_.IsOnCurrentVirtualDesktop)) `
      -and ([string]::IsNullOrWhiteSpace($titleIncludes) -or $_.Title.Contains($titleIncludes))
  })
  if ($matches.Count -ne 1) {
    throw "Expected exactly one visible top-level DevTools window for PID $requestedProcessId; found $($matches.Count)."
  }
  return $matches[0]
}

function Get-Intersection([Drawing.Rectangle]$Left, [Drawing.Rectangle]$Right) {
  return [Drawing.Rectangle]::Intersect($Left, $Right)
}

function Get-OverlappingWindows([IntPtr]$TargetHwnd, [Drawing.Rectangle]$AbsoluteViewport) {
  $result = @()
  foreach ($window in [Codex.WeappCapture.NativeCapture]::EnumerateWindowsAbove($TargetHwnd)) {
    if (-not $window.Visible -or $window.Minimized -or $window.Cloaked) { continue }
    $intersection = Get-Intersection $window.WindowRect $AbsoluteViewport
    if ($intersection.Width -le 0 -or $intersection.Height -le 0) { continue }
    $result += [ordered]@{
      hwnd = Format-Hwnd ([IntPtr]$window.Hwnd)
      processId = [int]$window.ProcessId
      title = [string]$window.Title
      className = [string]$window.ClassName
      windowRect = Convert-Rect $window.WindowRect
      intersection = Convert-Rect $intersection
    }
  }
  return @($result)
}

function Write-Result([object]$Request, [object]$Result) {
  $json = $Result | ConvertTo-Json -Depth 12 -Compress
  if ($Request.PSObject.Properties.Name -contains 'resultPath' -and -not [string]::IsNullOrWhiteSpace([string]$Request.resultPath)) {
    $resolved = [IO.Path]::GetFullPath([string]$Request.resultPath)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolved)) | Out-Null
    [IO.File]::WriteAllText($resolved, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  }
  [Console]::Out.WriteLine($json)
}

$dpiAwareness = [Codex.WeappCapture.NativeCapture]::EnableDpiAwareness()
$resolvedRequestPath = [IO.Path]::GetFullPath($RequestPath)
$request = Get-Content -LiteralPath $resolvedRequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$captureMode = Resolve-CaptureMode $request
if ($captureMode -in @('printwindow', 'printwindow-current') -and $dpiAwareness -ne 'per-monitor-aware-v2') {
  throw "PrintWindow capture requires PER_MONITOR_AWARE_V2; actual context: $dpiAwareness"
}
if ($Mode -eq 'Capture') {
  if ([string]$request.kind -ne 'wechat-devtools-win32-request-v1') {
    throw 'Capture request kind is invalid.'
  }
  foreach ($propertyName in @('prepareId', 'nonce', 'artifactBindingHash')) {
    if ([string]$request.$propertyName -notmatch '^[a-fA-F0-9]{64}$') {
      throw "Capture request $propertyName must be a SHA-256 value."
    }
  }
  if ([string]$request.expectedDesktopId -notmatch '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$') {
    throw 'Capture request expectedDesktopId is invalid.'
  }
}
$window = Resolve-BoundWindow $request
$windowEvidence = Convert-WindowEvidence $window
$hwnd = [IntPtr]$window.Hwnd
$transparentTargetRequested = ($request.PSObject.Properties.Name -contains 'transparentTargetCapture') `
  -and [bool]$request.transparentTargetCapture
$transparentTargetBefore = Convert-TransparentTargetEvidence $window

if ($Mode -eq 'Inspect') {
  if (-not (Test-WindowReady $window $captureMode)) {
    $diagnostic = $windowEvidence | ConvertTo-Json -Depth 5 -Compress
    throw "Bound DevTools window does not satisfy the selected capture mode desktop/state contract: $diagnostic"
  }
  if (-not [string]::IsNullOrWhiteSpace([string]$request.expectedTitleIncludes) `
      -and -not ([string]$window.Title).Contains([string]$request.expectedTitleIncludes)) {
    throw 'Bound window title is not WeChat DevTools.'
  }
  $windowEvidence['captureMode'] = $captureMode
  $windowEvidence['dpiAwareness'] = $dpiAwareness
  Write-Result $request $windowEvidence
  exit 0
}

if ($captureMode -eq 'printwindow-current' -and $transparentTargetRequested) {
  $readiness = Wait-TransparentCurrentCaptureReadiness `
    -TargetHwnd $hwnd `
    -TargetProcessId ([int]$request.processId) `
    -ExpectedWindowRect (Convert-RequestRect $request.expectedWindowRect) `
    -BaselineTransparent $transparentTargetBefore
  $window = $readiness.window
  $windowEvidence = Convert-WindowEvidence $window
  $hwnd = [IntPtr]$window.Hwnd
  $transparentTargetBefore = Convert-TransparentTargetEvidence $window
}
$desktopProbeUnavailable = $transparentTargetRequested `
  -and -not [bool]$window.Cloaked `
  -and [string]::IsNullOrWhiteSpace([string]$window.DesktopId) `
  -and -not [bool]$window.IsOnCurrentVirtualDesktop `
  -and [bool]$transparentTargetBefore.eligible

if (-not (Test-WindowReady $window $captureMode $transparentTargetRequested)) {
  throw 'Bound DevTools window does not satisfy the selected capture mode desktop/state contract.'
}
if ([int]$window.ProcessId -ne [int]$request.processId `
    -or (Format-Hwnd $hwnd).ToLowerInvariant() -ne ([string]$request.hwnd).ToLowerInvariant()) {
  throw 'Capture HWND/PID differs from the prepare binding.'
}
if (-not [string]::IsNullOrWhiteSpace([string]$request.expectedTitle) `
    -and [string]$window.Title -ne [string]$request.expectedTitle) {
  throw 'DevTools window title changed after prepare.'
}
if (-not $desktopProbeUnavailable -and [string]$window.DesktopId -ne [string]$request.expectedDesktopId) {
  throw 'DevTools virtual desktop changed after prepare.'
}
if ([bool]$window.Cloaked -ne [bool]$request.expectedCloaked) {
  throw 'DevTools cloak state changed after prepare.'
}
if ([int]$window.CloakState -ne [int]$request.expectedCloakState) {
  throw 'DevTools exact DWM cloak value changed after prepare.'
}
$expectedWindowRect = Convert-RequestRect $request.expectedWindowRect
if (-not (Test-SameRect $window.WindowRect $expectedWindowRect)) {
  throw 'DevTools physical window geometry changed after prepare; per-device calibration is invalid.'
}
if ([int]$window.Dpi -ne [int]$request.expectedDpi) {
  throw 'DevTools DPI changed after prepare; per-device calibration is invalid.'
}

$screenRect = Convert-RequestRect $request.screenCalibration.screenRect
$systemInfo = $request.systemInfo
$screenWidth = [int]$systemInfo.screenWidth
$screenHeight = [int]$systemInfo.screenHeight
$windowWidth = [int]$systemInfo.windowWidth
$windowHeight = [int]$systemInfo.windowHeight
if ($screenWidth -le 0 -or $screenHeight -le 0 -or $windowWidth -le 0 -or $windowHeight -le 0) {
  throw 'Logical screen/window dimensions must be positive.'
}
if ($windowWidth -ne $screenWidth) {
  throw 'Portrait Win32 crop requires windowWidth equal to screenWidth.'
}
if ($screenRect.X -lt 0 -or $screenRect.Y -lt 0 `
    -or $screenRect.Right -gt $window.WindowRect.Width `
    -or $screenRect.Bottom -gt $window.WindowRect.Height) {
  throw 'Calibrated device screen rect is outside the bound full frame.'
}
$scaleX = [double]$screenRect.Width / [double]$screenWidth
$scaleY = [double]$screenRect.Height / [double]$screenHeight
$expectedPhysicalScreenHeight = [Math]::Round($screenHeight * $scaleX, [MidpointRounding]::AwayFromZero)
if ([Math]::Abs($screenRect.Height - $expectedPhysicalScreenHeight) -gt 2) {
  throw 'Calibrated screen X/Y scales differ by more than two physical pixels.'
}
$viewportWidth = [int][Math]::Round($windowWidth * $scaleX, [MidpointRounding]::AwayFromZero)
$viewportHeight = [int][Math]::Round($windowHeight * $scaleX, [MidpointRounding]::AwayFromZero)
$viewportRect = [Drawing.Rectangle]::new(
  $screenRect.X,
  $screenRect.Bottom - $viewportHeight,
  $viewportWidth,
  $viewportHeight
)
if ($viewportRect.X -lt $screenRect.X -or $viewportRect.Y -lt $screenRect.Y `
    -or $viewportRect.Right -gt $screenRect.Right `
    -or $viewportRect.Bottom -gt $screenRect.Bottom) {
  throw 'Bottom-anchored viewport is outside the calibrated device screen.'
}
$absoluteViewport = [Drawing.Rectangle]::new(
  $window.WindowRect.X + $viewportRect.X,
  $window.WindowRect.Y + $viewportRect.Y,
  $viewportRect.Width,
  $viewportRect.Height
)
$auditOverlap = $captureMode -in @('visible', 'printwindow-current')
$overlapBefore = if ($auditOverlap) { @(Get-OverlappingWindows $hwnd $absoluteViewport) } else { @() }
$foregroundBeforeHwnd = [Codex.WeappCapture.NativeCapture]::GetForegroundWindow()
$foregroundBefore = [Codex.WeappCapture.NativeCapture]::InspectWindow($foregroundBeforeHwnd)
$targetNeverForeground = ($foregroundBeforeHwnd -ne $hwnd) `
  -and ([int]$foregroundBefore.ProcessId -ne [int]$request.processId)
if ($captureMode -ne 'visible' -and -not $targetNeverForeground) {
  throw 'Background capture refused because the target HWND or PID is foreground before capture.'
}

if ($desktopProbeUnavailable `
    -and [string]$foregroundBefore.DesktopId -ne [string]$request.expectedDesktopId) {
  throw 'Transparent-target desktop probe is unavailable and the stable foreground desktop differs from prepare.'
}

if ($captureMode -eq 'printwindow-current') {
  $foregroundHandle = Format-Hwnd $foregroundBeforeHwnd
  $foregroundCoverage = @($overlapBefore | Where-Object {
    [string]$_.hwnd -eq $foregroundHandle `
      -and [int]$_.intersection.x -eq [int]$absoluteViewport.X `
      -and [int]$_.intersection.y -eq [int]$absoluteViewport.Y `
      -and [int]$_.intersection.width -eq [int]$absoluteViewport.Width `
      -and [int]$_.intersection.height -eq [int]$absoluteViewport.Height
  })
  if ($foregroundBeforeHwnd -eq $hwnd) {
    throw 'Current-desktop PrintWindow refuses to capture the foreground target.'
  }
  if ($transparentTargetRequested -and -not [bool]$transparentTargetBefore.eligible) {
    throw 'Transparent-target PrintWindow requires live alpha-zero, layered, click-through and no-activate evidence.'
  }
  if (-not $transparentTargetRequested -and $foregroundCoverage.Count -ne 1) {
    throw 'Current-desktop PrintWindow requires the stable user foreground window to fully occlude the simulator viewport.'
  }
}

if ($captureMode -in @('printwindow', 'printwindow-current')) {
  $renderMethod = 'PrintWindow(PW_RENDERFULLCONTENT)'
  $cropEvidence = [Codex.WeappCapture.NativeCapture]::CapturePrintWindowFrame(
    $hwnd,
    $window.WindowRect,
    $viewportRect,
    [IO.Path]::GetFullPath([string]$request.fullFramePath),
    [IO.Path]::GetFullPath([string]$request.cropPath)
  )
} else {
  $renderMethod = 'CopyFromScreen'
  $cropEvidence = [Codex.WeappCapture.NativeCapture]::CaptureVisibleFrame(
    $window.WindowRect,
    $viewportRect,
    [IO.Path]::GetFullPath([string]$request.fullFramePath),
    [IO.Path]::GetFullPath([string]$request.cropPath)
  )
}
if ([bool]$cropEvidence.LikelyBlackFrame) {
  throw 'Win32 capture produced a black or effectively blank full frame.'
}
$fullPixelSha = [Codex.WeappCapture.NativeCapture]::ReadBitmapPixelSha256([string]$request.fullFramePath)
$fullFrameEvidence = [Codex.WeappCapture.NativeCapture]::InspectFullFrame(
  [string]$request.fullFramePath,
  $window.WindowRect.Width,
  $window.WindowRect.Height,
  $fullPixelSha
)

$windowAfter = [Codex.WeappCapture.NativeCapture]::InspectWindow($hwnd)
$transparentTargetAfter = Convert-TransparentTargetEvidence $windowAfter
$transparentTargetStable = Test-SameTransparentTargetEvidence $transparentTargetBefore $transparentTargetAfter
if ($transparentTargetRequested -and -not $transparentTargetStable) {
  throw 'Transparent-target evidence changed during PrintWindow capture.'
}
$windowStable = (Test-SameRect $window.WindowRect $windowAfter.WindowRect) `
  -and [int]$window.ProcessId -eq [int]$windowAfter.ProcessId `
  -and [string]$window.Title -eq [string]$windowAfter.Title `
  -and [string]$window.ClassName -eq [string]$windowAfter.ClassName `
  -and [int]$window.Dpi -eq [int]$windowAfter.Dpi `
  -and [string]$window.DesktopId -eq [string]$windowAfter.DesktopId `
  -and [bool]$window.IsOnCurrentVirtualDesktop -eq [bool]$windowAfter.IsOnCurrentVirtualDesktop `
  -and [bool]$window.Cloaked -eq [bool]$windowAfter.Cloaked `
  -and [int]$window.CloakState -eq [int]$windowAfter.CloakState `
  -and $windowAfter.Visible `
  -and -not $windowAfter.Minimized `
  -and (Test-WindowReady $windowAfter $captureMode $transparentTargetRequested)
$overlapAfter = if ($auditOverlap) { @(Get-OverlappingWindows $hwnd $absoluteViewport) } else { @() }
$overlapByHwnd = [ordered]@{}
foreach ($entry in @($overlapBefore) + @($overlapAfter)) { $overlapByHwnd[[string]$entry.hwnd] = $entry }
$overlaps = @($overlapByHwnd.Values)
$foregroundAfterHwnd = [Codex.WeappCapture.NativeCapture]::GetForegroundWindow()
$foregroundAfter = [Codex.WeappCapture.NativeCapture]::InspectWindow($foregroundAfterHwnd)
$targetNeverForeground = $targetNeverForeground `
  -and ($foregroundAfterHwnd -ne $hwnd) `
  -and ([int]$foregroundAfter.ProcessId -ne [int]$request.processId)
if ($captureMode -ne 'visible' -and -not $targetNeverForeground) {
  throw 'Background capture refused because the target HWND or PID became foreground during capture.'
}

$pixelProbes = [ordered]@{}
if ($request.PSObject.Properties.Name -contains 'pixelProbes' -and $null -ne $request.pixelProbes) {
  foreach ($property in $request.pixelProbes.PSObject.Properties) {
    $rect = $property.Value
    $probe = [Codex.WeappCapture.NativeCapture]::InspectPixelProbe(
      [string]$request.cropPath,
      [int]$rect.x,
      [int]$rect.y,
      [int]$rect.width,
      [int]$rect.height
    )
    $pixelProbes[$property.Name] = [ordered]@{
      rect = [ordered]@{ x = $probe.X; y = $probe.Y; width = $probe.Width; height = $probe.Height }
      pixelSha256 = [string]$probe.PixelSha256
      surfaceRatio = [double]$probe.SurfaceRatio
      overlayDarkRatio = [double]$probe.OverlayDarkRatio
      deepGreenRatio = [double]$probe.DeepGreenRatio
      winnerSoftRatio = [double]$probe.WinnerSoftRatio
      loserSoftRatio = [double]$probe.LoserSoftRatio
    }
  }
}
if ($captureMode -eq 'printwindow-current' -and -not $transparentTargetRequested `
    -and (($foregroundAfterHwnd -ne $foregroundBeforeHwnd) `
      -or ([int]$foregroundAfter.ProcessId -ne [int]$foregroundBefore.ProcessId))) {
  throw 'Occluded current-desktop capture requires the same foreground occluder before and after capture.'
}

$result = [ordered]@{
  capturedAt = [DateTime]::UtcNow.ToString('o')
  captureMode = $captureMode
  renderMethod = $renderMethod
  dpiAwareness = $dpiAwareness
  processId = [int]$window.ProcessId
  hwnd = Format-Hwnd $hwnd
  title = [string]$window.Title
  className = [string]$window.ClassName
  dpi = [int]$window.Dpi
  visible = [bool]$window.Visible
  minimized = [bool]$window.Minimized
  cloaked = [bool]$window.Cloaked
  cloakState = [int]$window.CloakState
  desktopId = [string]$window.DesktopId
  isOnCurrentVirtualDesktop = [bool]$window.IsOnCurrentVirtualDesktop
  desktopProbeUnavailable = [bool]$desktopProbeUnavailable
  windowRect = Convert-Rect $window.WindowRect
  rawWindowRect = Convert-Rect $window.RawWindowRect
  windowStable = [bool]$windowStable
  windowAfter = Convert-WindowEvidence $windowAfter
  foreground = [ordered]@{
    before = Convert-WindowEvidence $foregroundBefore
    after = Convert-WindowEvidence $foregroundAfter
    targetNeverForeground = [bool]$targetNeverForeground
  }
  desktop = [ordered]@{
    targetBefore = [string]$window.DesktopId
    targetAfter = [string]$windowAfter.DesktopId
    currentBefore = [string]$foregroundBefore.DesktopId
    currentAfter = [string]$foregroundAfter.DesktopId
    targetOnCurrentBefore = [bool]$window.IsOnCurrentVirtualDesktop
    targetOnCurrentAfter = [bool]$windowAfter.IsOnCurrentVirtualDesktop
  }
  requestProvenance = [ordered]@{
    kind = [string]$request.kind
    prepareId = [string]$request.prepareId
    nonce = [string]$request.nonce
    artifactBindingHash = [string]$request.artifactBindingHash
  }
  overlappingWindows = @($overlaps)
  overlappingWindowsBefore = @($overlapBefore)
  overlappingWindowsAfter = @($overlapAfter)
  transparentTarget = [ordered]@{
    requested = [bool]$transparentTargetRequested
    stable = [bool]$transparentTargetStable
    before = $transparentTargetBefore
    after = $transparentTargetAfter
  }
  pixelProbes = $pixelProbes
  screenCalibration = [ordered]@{
    source = [string]$request.screenCalibration.source
    model = [string]$systemInfo.model
    logicalScreen = [ordered]@{ width = $screenWidth; height = $screenHeight }
    logicalWindow = [ordered]@{ width = $windowWidth; height = $windowHeight }
    screenRect = Convert-Rect $screenRect
    scaleX = $scaleX
    scaleY = $scaleY
  }
  viewportRect = Convert-Rect $viewportRect
  absoluteViewportRect = Convert-Rect $absoluteViewport
  fullFrame = [ordered]@{
    path = [string]$fullFrameEvidence.Path
    width = [int]$fullFrameEvidence.Width
    height = [int]$fullFrameEvidence.Height
    byteLength = [long]$fullFrameEvidence.ByteLength
    sha256 = [string]$fullFrameEvidence.Sha256
    pixelSha256 = [string]$fullFrameEvidence.PixelSha256
  }
  crop = [ordered]@{
    path = [string]$cropEvidence.Path
    width = [int]$cropEvidence.Width
    height = [int]$cropEvidence.Height
    byteLength = [long]$cropEvidence.ByteLength
    sha256 = [string]$cropEvidence.Sha256
    pixelSha256 = [string]$cropEvidence.PixelSha256
  }
  frameRegionPixelSha256 = [string]$cropEvidence.FrameRegionPixelSha256
  cropMatchesFrameRegion = [bool]$cropEvidence.CropMatchesFrameRegion
  nonBlackPixelRatio = [double]$cropEvidence.NonBlackPixelRatio
  distinctColorCount = [int]$cropEvidence.DistinctColorCount
  likelyBlackFrame = [bool]$cropEvidence.LikelyBlackFrame
}
Write-Result $request $result
