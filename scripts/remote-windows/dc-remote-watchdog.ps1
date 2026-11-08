<#
.SYNOPSIS
  Keeps the Desktop Commander Remote device agent alive on Windows.

.DESCRIPTION
  Runs `npx @wonderwhy-er/desktop-commander@latest remote` as a supervised child
  process and restarts it when:
    1. the agent process exits or crashes;
    2. the PC resumes from sleep/hibernate (detected as a wall-clock gap), which
       otherwise leaves a half-dead connection: the device shows "Online" in the
       dashboard but remote tool calls stay "pending" forever;
    3. the network comes back after an outage.
  A named mutex guarantees only one watchdog (and therefore one agent) runs,
  which prevents duplicate device registrations.

  Logs: %LOCALAPPDATA%\DesktopCommanderRemote\logs
#>
[CmdletBinding()]
param(
  [int]$CheckSeconds   = 15,   # health-check interval
  [int]$SleepGapSeconds = 90,  # a tick later than this => machine was asleep
  [int]$MaxRunHours    = 12    # proactive recycle to clear silent stale sessions
)

$ErrorActionPreference = 'Continue'
$root   = Join-Path $env:LOCALAPPDATA 'DesktopCommanderRemote'
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$wdLog  = Join-Path $logDir 'watchdog.log'

function Write-Log([string]$msg) {
  $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $msg
  Add-Content -Path $wdLog -Value $line
  Get-ChildItem $logDir -Filter 'agent-*.log' |
    Sort-Object LastWriteTime -Descending | Select-Object -Skip 10 |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

# --- single instance ---------------------------------------------------------
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Global\DesktopCommanderRemoteWatchdog', [ref]$created)
if (-not $created) { Write-Log 'Another watchdog is already running. Exiting.'; exit 0 }

# --- helpers -----------------------------------------------------------------
function Stop-StrayAgents {
  # Only remote agents; never the local stdio MCP used by Claude Desktop.
  Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='cmd.exe'" |
    Where-Object { $_.CommandLine -match 'desktop-commander' -and $_.CommandLine -match '\sremote(\s|$)' } |
    ForEach-Object {
      Write-Log "Stopping stray agent PID $($_.ProcessId)"
      & taskkill.exe /PID $_.ProcessId /T /F 2>$null | Out-Null
    }
}

function Test-Online {
  try {
    $r = Invoke-WebRequest -Uri 'https://mcp.desktopcommander.app/' -UseBasicParsing -TimeoutSec 10 -Method Head
    return ($r.StatusCode -lt 500)
  } catch { return $false }
}

function Start-Agent {
  Stop-StrayAgents
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $out = Join-Path $logDir "agent-$stamp.log"
  $err = Join-Path $logDir "agent-$stamp.err.log"
  $p = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c','npx','-y','@wonderwhy-er/desktop-commander@latest','remote' `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $out -RedirectStandardError $err
  Write-Log "Agent started (PID $($p.Id)). Log: $out"
  return $p
}

function Stop-Agent($p) {
  if ($p -and -not $p.HasExited) {
    & taskkill.exe /PID $p.Id /T /F 2>$null | Out-Null
    Write-Log "Agent PID $($p.Id) stopped."
  }
}

# --- main loop ---------------------------------------------------------------
Write-Log '=== Watchdog started ==='
while (-not (Test-Online)) { Write-Log 'Waiting for network...'; Start-Sleep 20 }

$agent     = Start-Agent
$startedAt = Get-Date
$lastTick  = Get-Date
$wasOnline = $true

while ($true) {
  Start-Sleep -Seconds $CheckSeconds
  $now = Get-Date
  $gap = ($now - $lastTick).TotalSeconds
  $lastTick = $now
  $reason = $null

  if ($agent.HasExited)                          { $reason = "agent exited (code $($agent.ExitCode))" }
  elseif ($gap -gt $SleepGapSeconds)             { $reason = "resume from sleep detected (gap $([int]$gap)s)" }
  elseif (($now - $startedAt).TotalHours -ge $MaxRunHours) { $reason = "scheduled recycle after $MaxRunHours h" }
  else {
    $online = Test-Online
    if ($online -and -not $wasOnline)            { $reason = 'network restored' }
    $wasOnline = $online
  }

  if ($reason) {
    Write-Log "Restarting: $reason"
    Stop-Agent $agent
    while (-not (Test-Online)) { Write-Log 'Waiting for network...'; Start-Sleep 20 }
    Start-Sleep 5
    $agent     = Start-Agent
    $startedAt = Get-Date
    $wasOnline = $true
  }
}
