Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::new((Get-Item (Join-Path $PSScriptRoot "..\public\logo.png")).FullName)
$w = $bmp.Width; $h = $bmp.Height
"size: ${w}x${h}"
$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$bd = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $bd.Stride
$buf = New-Object 'byte[]' ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($bd.Scan0, $buf, 0, $buf.Length)
$bmp.UnlockBits($bd)
$minx = $w; $miny = $h; $maxx = 0; $maxy = 0
for ($y = 0; $y -lt $h; $y += 2) {
  $row = $y * $stride
  for ($x = 0; $x -lt $w; $x += 2) {
    $i = $row + $x * 4
    $a = $buf[$i + 3]
    if ($a -gt 16) {
      if ($x -lt $minx) { $minx = $x }
      if ($x -gt $maxx) { $maxx = $x }
      if ($y -lt $miny) { $miny = $y }
      if ($y -gt $maxy) { $maxy = $y }
    }
  }
}
"ring bbox: x ${minx}-${maxx}  y ${miny}-${maxy}"
"fractions: left {0:N3} right {1:N3} top {2:N3} bottom {3:N3}" -f ($minx / $w), ($maxx / $w), ($miny / $h), ($maxy / $h)
"center: {0:N3}, {1:N3}   diameter: {0:N3}w / {1:N3}h" -f ((($minx + $maxx) / 2) / $w, ((($miny + $maxy) / 2) / $h), (($maxx - $minx) / $w), (($maxy - $miny) / $h))
$bmp.Dispose()
