Add-Type -AssemblyName System.Drawing

$src = 'c:\Users\Thodoris\VSCode Projects\ProjectPulse\public\logowithbg.png'
$res = 'c:\Users\Thodoris\VSCode Projects\ProjectPulse\android\app\src\main\res'
$source = [System.Drawing.Image]::FromFile($src)
try {
    $densities = [ordered]@{
        'mipmap-mdpi'   = 48
        'mipmap-hdpi'   = 72
        'mipmap-xhdpi'  = 96
        'mipmap-xxhdpi' = 144
        'mipmap-xxxhdpi' = 192
    }
    foreach ($entry in $densities.GetEnumerator()) {
        $dir = Join-Path $res $entry.Key
        $size = $entry.Value

        # Square launcher icon.
        $sq = New-Object System.Drawing.Bitmap($size, $size)
        $g = [System.Drawing.Graphics]::FromImage($sq)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($source, 0, 0, $size, $size)
        $g.Dispose()
        $sq.Save((Join-Path $dir 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        $sq.Dispose()

        # Round launcher icon: circular clip.
        $rd = New-Object System.Drawing.Bitmap($size, $size)
        $g = [System.Drawing.Graphics]::FromImage($rd)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
        $path.AddEllipse($rect)
        $g.SetClip($path)
        $g.DrawImage($source, 0, 0, $size, $size)
        $g.Dispose()
        $path.Dispose()
        $rd.Save((Join-Path $dir 'ic_launcher_round.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        $rd.Dispose()

        Write-Output "generated $entry.Key ($size x $size)"
    }
} finally {
    $source.Dispose()
}
Write-Output 'done'
