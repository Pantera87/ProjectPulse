param(
    [string]$Step
)
$adb = 'C:\Android\sdk\platform-tools\adb.exe'
$dev = '9c822955'
$uxml = 'c:\Users\Thodoris\VSCode Projects\ProjectPulse\android\tools\u.xml'

function Dump-Ui {
    & $adb -s $dev shell 'uiautomator dump /sdcard/u.xml' | Out-Null
    & $adb -s $dev pull /sdcard/u.xml $uxml | Out-Null
    (Get-Content $uxml -Raw)
}

function Show-Texts([string]$xml, [string]$pattern) {
    [regex]::Matches($xml, 'text="([^"]*)"') |
        Where-Object { $_.Groups[1].Value -match $pattern } |
        ForEach-Object { $_.Groups[1].Value }
}

switch ($Step) {
    'toggle-local' {
        & $adb -s $dev shell input tap 595 800
        Start-Sleep -Seconds 2
        $xml = Dump-Ui
        Write-Output '--- helper text:'
        Show-Texts $xml 'Data is '
        Write-Output '--- Reconnect bounds:'
        [regex]::Matches($xml, 'text="Reconnect"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"') |
            ForEach-Object { $_.Groups | ForEach-Object { $_.Value } }
    }
    'open-connect' {
        & $adb -s $dev shell input tap 1550 490
        Start-Sleep -Seconds 3
        $xml = Dump-Ui
        Write-Output '--- visible texts:'
        Show-Texts $xml '^(?!$).*' | Select-Object -First 25
    }
}
