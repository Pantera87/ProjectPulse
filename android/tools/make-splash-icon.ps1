# Generates the Android 12+ system-splash icon (windowSplashScreenAnimatedIcon).
#
# Source: public/logo1024transparent.png — the logo on a full-bleed dark badge
# disc (NOT actually transparent). The system splash crops its icon to a circle
# and upscales low-density assets, so a square/badge image shows up clipped and
# blurry. This script:
#   1. cuts the neon art out of the badge disc (alpha by max channel),
#   2. fits the art's bounding box into the splash safe zone (2/3 of the canvas,
#      matching the circular mask) on a fresh 1024x1024 transparent canvas,
#   3. saves it to res/drawable-nodpi/splash_logo.png (nodpi: raw pixels, so a
#      1024 px raster is only ever downscaled — crisp at any device density).
#
# Usage:  pwsh android/tools/make-splash-icon.ps1
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$root = 'c:\Users\Thodoris\VSCode Projects\ProjectPulse'
$src  = Join-Path $root 'public\logo1024transparent.png'
$outDir = Join-Path $root 'android\app\src\main\res\drawable-nodpi'
$out  = Join-Path $outDir 'splash_logo.png'

$low  = 60    # max(R,G,B) below this = fully transparent (badge disc)
$high = 160   # max(R,G,B) at/above this = fully opaque (neon core)
$size = 1024  # output canvas

$orig = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap($orig)
$w = $bmp.Width
$h = $bmp.Height
Write-Output "source: $w x $h"

# ---- pass 1: brightness cut + art bounding box -----------------------------
$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$sd = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$buf = New-Object byte[] ($w * $h * 4)
[System.Runtime.InteropServices.Marshal]::Copy($sd.Scan0, $buf, 0, $buf.Length)
$bmp.UnlockBits($sd)

# 32bppArgb in memory is B,G,R,A (little-endian) at offsets o..o+3.
$minX = $w; $minY = $h; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $h; $y++) {
    $row = $y * $w
    for ($x = 0; $x -lt $w; $x++) {
        $o = ($row + $x) * 4
        $m = $buf[$o]; if ($buf[$o+1] -gt $m) { $m = $buf[$o+1] }; if ($buf[$o+2] -gt $m) { $m = $buf[$o+2] }
        if ($m -ge $high)      { $a = 255 }
        elseif ($m -gt $low)   { $a = [int](($m - $low) * 255 / ($high - $low)) }
        else                   { $a = 0 }
        $buf[$o + 3] = [byte]$a
        if ($a -gt 0) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
if ($maxX -lt 0) { throw 'no art found — tune $low/$high' }
$bw = $maxX - $minX + 1
$bh = $maxY - $minY + 1
Write-Output "art bbox: x=$minX y=$minY w=$bw h=$bh"

# write the cut art back into a bitmap
$cut = New-Object System.Drawing.Bitmap($w, $h)
$cd = $cut.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
[System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $cd.Scan0, $buf.Length)
$cut.UnlockBits($cd)

# ---- pass 2: fit into the safe zone on a transparent 1024 canvas -----------
$zone = [int]($size * 2 / 3)   # splash safe zone = 2/3 of the icon (circular mask)
$scale = [Math]::Min($zone / $bw, $zone / $bh)
$nw = [int]($bw * $scale)
$nh = [int]($bh * $scale)

$art = New-Object System.Drawing.Bitmap($bw, $bh)
$g = [System.Drawing.Graphics]::FromImage($art)
$g.DrawImage($cut,
    (New-Object System.Drawing.Rectangle(0, 0, $bw, $bh)),
    (New-Object System.Drawing.Rectangle($minX, $minY, $bw, $bh)),
    [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()

$canvas = New-Object System.Drawing.Bitmap($size, $size)   # zeroed = transparent
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$dx = [int](($size - $nw) / 2)
$dy = [int](($size - $nh) / 2)
$g.DrawImage($art, (New-Object System.Drawing.Rectangle($dx, $dy, $nw, $nh)))
$g.Dispose()

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$canvas.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

Write-Output "wrote $out (art $bw x $bh -> $nw x $nh at $dx,$dy)"
$art.Dispose(); $cut.Dispose(); $bmp.Dispose(); $canvas.Dispose(); $orig.Dispose()
Write-Output 'done'