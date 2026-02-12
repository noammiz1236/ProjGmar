# SmartCart Server Health Check & Auto-Restart
# Run during heartbeats to monitor and restart if needed

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$logFile = "C:\Users\rdiol\.openclaw\workspace\ProjGmar\server-status.log"

# Check if ports are listening
$backend = netstat -ano | Select-String ":3000.*LISTENING"
$frontend = netstat -ano | Select-String ":5173.*LISTENING"

$backendRunning = $backend -ne $null
$frontendRunning = $frontend -ne $null

if (-not $backendRunning -or -not $frontendRunning) {
    # Log the downtime
    $status = @"

### $timestamp - Servers DOWN
- Backend (3000): $(if ($backendRunning) {"RUNNING"} else {"STOPPED"})
- Frontend (5173): $(if ($frontendRunning) {"RUNNING"} else {"STOPPED"})
- Action: Auto-restarting via heartbeat check
"@
    Add-Content -Path $logFile -Value $status
    
    Write-Output "ALERT: SmartCart servers down - restarting..."
    exit 1
} else {
    Write-Output "OK: Both servers running"
    exit 0
}
