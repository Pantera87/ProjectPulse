$x = Get-Content 'c:\Users\Thodoris\VSCode Projects\ProjectPulse\android\tools\u.xml' -Raw
[regex]::Matches($x, 'text="(Data is [^"]*)"') | ForEach-Object { $_.Groups[1].Value }
[regex]::Matches($x, 'text="(Reconnect|Connect to ProjectPulse|ON-DEVICE MODE|Data source|WELCOME BACK|UPDATES)"') |
    ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
