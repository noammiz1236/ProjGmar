# SmartCart Monitor Skill - Installation Complete ✅

## What Was Created

A complete skill for monitoring and managing your SmartCart servers.

**Skill Location**: `C:\Users\rdiol\AppData\Roaming\npm\node_modules\openclaw\skills\smartcart-monitor`

## Skill Contents

### Main Documentation
- **SKILL.md** - Complete guide for server monitoring and PM2 management

### Scripts (executable)
- **check-servers.ps1** - Health check script (used in heartbeats)
- **restart-servers.ps1** - Automated server restart with verification

### References (detailed guides)
- **pm2-commands.md** - Complete PM2 command reference
- **troubleshooting.md** - Common issues and solutions

## Quick Commands You Can Now Use

### Check Server Status
```powershell
pm2 status
```

### Health Check
```powershell
cd C:\Users\rdiol\AppData\Roaming\npm\node_modules\openclaw\skills\smartcart-monitor\scripts
.\check-servers.ps1
```

### Restart Servers
```powershell
cd C:\Users\rdiol\AppData\Roaming\npm\node_modules\openclaw\skills\smartcart-monitor\scripts
.\restart-servers.ps1 -All
```

### View Logs
```powershell
pm2 logs
pm2 logs smartcart-backend
pm2 logs smartcart-frontend
```

### After Windows Reboot
```powershell
pm2 resurrect
```

## How the Skill Works

When you ask me things like:
- "Check the SmartCart servers"
- "Are the servers running?"
- "Restart the backend"
- "Show me the server logs"
- "SmartCart health check"

I will automatically load this skill and use the appropriate commands/scripts.

## Integrated with Heartbeat

The skill integrates with your `HEARTBEAT.md` monitoring. Every ~30 minutes, the heartbeat will:
1. Run `check-servers.ps1`
2. If servers are down, alert you
3. Restart them automatically
4. Log the downtime to `server-status.log`

## Files Created

**In workspace** (for easy access):
- `C:\Users\rdiol\.openclaw\workspace\smartcart-monitor\` - Original skill development folder

**Installed** (for OpenClaw to use):
- `C:\Users\rdiol\AppData\Roaming\npm\node_modules\openclaw\skills\smartcart-monitor\` - Active skill

**Documentation** (already in ProjGmar):
- `PM2-SETUP.md` - PM2 setup and management guide
- `server-status.log` - Downtime tracking log
- `check-servers.ps1` - Health check script
- `ecosystem.config.cjs` - PM2 configuration

## Testing

I tested the health check script - it works perfectly:
```
✓ check-servers.ps1 → "OK: All servers running"
```

The skill is now active and ready to use!
