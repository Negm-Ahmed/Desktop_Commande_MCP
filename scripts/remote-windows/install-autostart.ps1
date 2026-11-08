<#
.SYNOPSIS
  One-time installer: registers the Desktop Commander Remote watchdog as a
  Windows Scheduled Task that starts at logon, runs hidden, never times out,
  keeps running on battery, and restarts itself if it ever fails.
  Run in a normal (non-admin) PowerShell:
    powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1
#>
$ErrorActionPreference = 'Stop'
$taskName = 'DesktopCommanderRemote'
$destDir  = Join-Path $env:LOCALAPPDATA 'DesktopCommanderRemote'
New-Item -ItemType Directory -Force -Path $destDir | Out-Null

# 1. Prerequisite: Node.js 18+
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js not found. Install Node.js 18+ (https://nodejs.org) and re-run.' }
$ver = [version]((& node -v).TrimStart('v'))
if ($ver.Major -lt 18) { throw "Node.js $ver is too old. Install 18+ and re-run." }

# 2. Copy watchdog to a stable location (so moving/deleting the repo can't break it)
$src = Join-Path $PSScriptRoot 'dc-remote-watchdog.ps1'
$dst = Join-Path $destDir 'dc-remote-watchdog.ps1'
Copy-Item $src $dst -Force

# 3. Stop any manually started agents/terminals and an old task
Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# 4. Register task
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' `
              -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$dst`""
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet `
              -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) `
              -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
              -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal `
  -Description 'Keeps Desktop Commander Remote device agent connected (auto-restart, sleep-resume recovery).' | Out-Null

# 5. Start now
Start-ScheduledTask -TaskName $taskName
Write-Host "Installed and started '$taskName'."
Write-Host "Logs: $destDir\logs"
Write-Host 'If this is the first run on this PC, a browser sign-in window opens once: approve it.'
