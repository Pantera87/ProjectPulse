param(
    [string]$Pattern = '.',
    [switch]$Clickables,
    [switch]$Fresh   # do a fresh uiautomator dump + pull first
)
$adb = 'C:\Android\sdk\platform-tools\adb.exe'
$dev = '9c822955'
$uxml = 'c:\Users\Thodoris\VSCode Projects\ProjectPulse\android\tools\u.xml'

if ($Fresh) {
    & $adb -s $dev shell 'uiautomator dump /sdcard/u.xml' | Out-Null
    & $adb -s $dev pull /sdcard/u.xml $uxml | Out-Null
}
if (-not (Test-Path $uxml)) { Write-Output 'NO UML — run with -Fresh first'; exit 0 }
$x = Get-Content $uxml -Raw

if ($Clickables) {
    [regex]::Matches($x, '<node[^>]*?text="([^"]*)"[^>]*?clickable="true"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"') |
        ForEach-Object {
            $m = $_.Groups
            "$($m[1].Value)  [$($m[2].Value),$($m[3].Value)] [$($m[4].Value),$($m[5].Value)]"
        }
    return
}

[regex]::Matches($x, 'text="([^"]*)"') |
    Where-Object { $_.Groups[1].Value -ne '' } |
    ForEach-Object { $_.Groups[1].Value } |
    Where-Object { $_ -match $Pattern } |
    Select-Object -Unique
