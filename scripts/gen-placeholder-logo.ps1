# Generates a placeholder logo.png (1024x1024) matching the ProjectPulse
# color scheme: gradient ECG-style ring in the upper portion, empty lower
# third reserved for the wordmark. Replace public/logo.png with your
# Flux2 render whenever ready.
Add-Type -AssemblyName System.Drawing

$out = Join-Path (Split-Path $PSScriptRoot -Parent) "public"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$file = Join-Path $out "logo.png"

$size = 1024
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(6, 8, 20)) # --background #060814
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$cx = 512
$cy = 350
$r = 205
$thickness = 26

$sky    = @(79, 140, 255)  # #4f8cff
$viol   = @(139, 92, 246)  # #8b5cf6
$purple = @(192, 132, 252) # #c084fc

function Lerp([int[]]$a, [int[]]$b, [double]$t) {
    @([int]($a[0] + ($b[0] - $a[0]) * $t),
       [int]($a[1] + ($b[1] - $a[1]) * $t),
       [int]($a[2] + ($b[2] - $a[2]) * $t))
}

function RingColor([double]$t) {
    if ($t -lt 0.5) { return (Lerp $sky $viol ($t / 0.5)) }
    return (Lerp $viol $purple (($t - 0.5) / 0.5))
}

$steps = 240
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, $thickness)
$pen.StartCap  = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap    = [System.Drawing.Drawing2D.LineCap]::Round

for ($i = 0; $i -lt $steps; $i++) {
    $t0 = ($i / $steps) * 2 * [Math]::PI - [Math]::PI / 2
    $t1 = (($i + 1) / $steps) * 2 * [Math]::PI - [Math]::PI / 2 + 0.012
    $c  = RingColor ($i / $steps)
    $pen.Color = [System.Drawing.Color]::FromArgb($c[0], $c[1], $c[2])
    $g.DrawLine($pen,
        ($cx + $r * [Math]::Cos($t0)), ($cy + $r * [Math]::Sin($t0)),
        ($cx + $r * [Math]::Cos($t1)), ($cy + $r * [Math]::Sin($t1)))
}

# Small heartbeat spike on the right side of the ring.
$pen.Width = $thickness
$c = RingColor 0.78
$pen.Color = [System.Drawing.Color]::FromArgb($c[0], $c[1], $c[2])
$bx = $cx + $r * [Math]::Cos(-0.5)
$by = $cy + $r * [Math]::Sin(-0.5)
$spike = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new($bx, $by),
    [System.Drawing.PointF]::new($bx + 70, $by - 40),
    [System.Drawing.PointF]::new($bx + 120, $by + 55),
    [System.Drawing.PointF]::new($bx + 175, $by - 95),
    [System.Drawing.PointF]::new($bx + 235, $by + 10)
)
$g.DrawLines($pen, $spike)

$pen.Dispose()
$bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output "Wrote $file"
