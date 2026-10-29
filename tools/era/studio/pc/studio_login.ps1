# Nocimonorcen Era Studio: at login, start the studio once so anything queued while the PC was off gets picked up.
# Waits two minutes so the Claude desktop app is up first (the studio reaches the GPU through it).
$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot 'studio_login.log'
Start-Sleep -Seconds 120
$url = 'https://nocimonorcen-studio.netlify.app/api/run?why=login&k=<OWNER_KEY>'
try {
  $r = Invoke-RestMethod -Uri $url -Headers @{ Accept = 'application/json' } -TimeoutSec 60
  $msg = if ($r.ok) { "started $($r.session)" } else { "not started: $($r.text)" }
} catch { $msg = "failed: $($_.Exception.Message)" }
Add-Content -Path $log -Value "$(Get-Date -Format s)  $msg"
