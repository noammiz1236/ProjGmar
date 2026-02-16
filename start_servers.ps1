# Start SmartCart servers in background
$ErrorActionPreference = "Continue"

# Start backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Users\rdiol\.openclaw\workspace\ProjGmar\server; node server_clean.js" -WindowStyle Hidden

Start-Sleep -Seconds 2

# Start frontend  
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd C:\Users\rdiol\.openclaw\workspace\ProjGmar\frontend; npm run dev" -WindowStyle Hidden

Write-Host "SmartCart servers started in background"
