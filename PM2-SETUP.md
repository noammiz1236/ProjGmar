# PM2 Process Manager - SmartCart Servers

## ✅ Current Status

Both SmartCart servers are now managed by **PM2** (Process Manager 2):

- **Backend** (port 3000): Running via PM2
- **Frontend** (port 5173): Running via PM2

## Benefits

✅ **No more 30-minute crashes** - PM2 runs indefinitely  
✅ **Auto-restart on crash** - If a server crashes, PM2 restarts it automatically  
✅ **Better logging** - Logs stored in `logs/` directory  
✅ **Resource monitoring** - CPU/memory usage tracking  
✅ **Process management** - Easy start/stop/restart

## Commands

```powershell
# Check status
pm2 status

# View logs
pm2 logs smartcart-backend
pm2 logs smartcart-frontend

# Restart servers
pm2 restart all
pm2 restart smartcart-backend
pm2 restart smartcart-frontend

# Stop servers
pm2 stop all

# Start servers
cd C:\Users\rdiol\.openclaw\workspace\ProjGmar
pm2 start ecosystem.config.cjs
```

## Auto-Start on Windows Reboot

PM2 process list is saved, but Windows doesn't have native auto-start like Linux.

**Option 1: Manual start after reboot**
```powershell
pm2 resurrect
```

**Option 2: Create Windows Task Scheduler task** (recommended)
1. Open Task Scheduler
2. Create Basic Task
3. Trigger: At system startup
4. Action: Start a program
5. Program: `powershell.exe`
6. Arguments: `-Command "pm2 resurrect"`

## Configuration

All PM2 configuration is in `ecosystem.config.cjs`:
- Server paths
- Log file locations
- Auto-restart settings
- Environment variables

## Logs

Logs are stored in:
- Backend: `logs/backend-out.log` & `logs/backend-error.log`
- Frontend: `logs/frontend-out.log` & `logs/frontend-error.log`

## Troubleshooting

**Servers not starting?**
```powershell
pm2 logs --lines 50
```

**Clear and restart:**
```powershell
pm2 delete all
pm2 start ecosystem.config.cjs
```

**Check resource usage:**
```powershell
pm2 monit
```
