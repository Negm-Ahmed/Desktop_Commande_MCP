# Desktop Commander Remote — Permanent Windows Fix

## Problem statement
The Remote device agent is a plain terminal process
(`npx @wonderwhy-er/desktop-commander@latest remote`). It has no service mode and
no auto-restart. Any of the following breaks the connector:

| Trigger | Symptom |
|---|---|
| Terminal window closed / PC restarted | Device **Offline** |
| Laptop sleeps, Wi-Fi drops, VPN toggles | Device shows **Online**, but every tool call stays **pending** |
| Agent started twice / re-paired | **Duplicate devices** with the same name in the dashboard |

## Permanent solution (this folder)
| File | Purpose |
|---|---|
| `dc-remote-watchdog.ps1` | Supervises the agent. Restarts it on crash, on resume from sleep, on network restore, and every 12 h. Single-instance lock prevents duplicates. |
| `install-autostart.ps1` | One-time: registers Scheduled Task `DesktopCommanderRemote` (at logon, hidden, no time limit, runs on battery, self-restarts). |
| `uninstall-autostart.ps1` | Removes the task and stops the agent. |

## Install (once)
1. Close every terminal currently running `desktop-commander remote`.
2. First-time pairing only (skip if the device is already authorized):
   `npx @wonderwhy-er/desktop-commander@latest remote` → approve in browser → `Ctrl+C`.
3. From this folder, in normal PowerShell:
   `powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1`
4. Delete the stale duplicate `Negm-Lenovo` device (Offline) at https://mcp.desktopcommander.app/ → **Revoke**.

## Verify
- Dashboard: exactly one `Negm-Lenovo`, Online.
- In Claude: "DC: get_config" returns within seconds.
- Logs: `%LOCALAPPDATA%\DesktopCommanderRemote\logs\watchdog.log`.

## Rollback
`powershell -ExecutionPolicy Bypass -File .\uninstall-autostart.ps1`
