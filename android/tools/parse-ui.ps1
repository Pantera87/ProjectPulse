param(
    [string]$Filter = '^(Reconnect|Connect|Server|On-device|DATA SOURCE|Settings|On-device mode|Database storage:.*)$'
)
$xml = Get-Content 'c:\Users\Thodoris\VSCode Projects\ProjectPulse\android\tools\u.xml' -Raw
[regex]::Matches($xml, '<node[^>]*text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"') |
    ForEach-Object {
        $m = $_.Groups
        if ($m[1].Value -match $Filter) {
            "$($m[1].Value): [$($m[2].Value),$($m[3].Value)] [$($m[4].Value),$($m[5].Value)]"
        }
    }
