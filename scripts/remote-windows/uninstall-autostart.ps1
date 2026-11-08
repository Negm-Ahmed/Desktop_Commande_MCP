# Removes the scheduled task and stops the agent. Device stays authorized.
$taskName = 'DesktopCommanderRemote'
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='cmd.exe' OR Name='powershell.exe'" |
  Where-Object { $_.CommandLine -match 'dc-remote-watchdog|desktop-commander.*\sremote' } |
  ForEach-Object { & taskkill.exe /PID $_.ProcessId /T /F 2>$null | Out-Null }
Write-Host "Removed '$taskName' and stopped the remote agent."
