#!/usr/bin/env pwsh
## PokeClaw - Windows Onboarding & Launch Script
##
## Usage:
##   pwsh -File start-pokeclaw.ps1            # interactive setup
##   pwsh -File start-pokeclaw.ps1 -Quiet     # skip prompts, use env vars / saved config
##
## Environment variables (all optional):
##   POKECLAW_PORT            - port (default: 3741)
##   POKECLAW_ROOTS           - comma-separated allowed paths (default: $HOME)
##   POKECLAW_TOKEN           - secret auth token
##   POKECLAW_TUNNEL_ENABLED  - 1 to enable the Poke tunnel (default: 1)

[CmdletBinding()]
param([switch]$Quiet)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigDir = Join-Path $HOME ".pokeclaw"
$ConfigFile = Join-Path $ConfigDir "launch.env"

function Test-Cmd([string]$name) {
  [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Get-EnvVar([string]$key) {
  [Environment]::GetEnvironmentVariable($key)
}

# --- Load saved config (shared launch.env, `export KEY=value` lines) ---------
$cfg = @{}
if (Test-Path $ConfigFile) {
  foreach ($line in Get-Content $ConfigFile) {
    if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $val = $Matches[2].Trim()
      if ($val.Length -ge 2 -and $val.StartsWith("'") -and $val.EndsWith("'")) {
        $val = $val.Substring(1, $val.Length - 2)
      } elseif ($val.Length -ge 2 -and $val.StartsWith('"') -and $val.EndsWith('"')) {
        $val = $val.Substring(1, $val.Length - 2)
      }
      $cfg[$Matches[1]] = $val
    }
  }
}

function Resolve-Setting([string]$key, [string]$fallback) {
  $envVal = Get-EnvVar $key
  if ($envVal) { return $envVal }
  if ($cfg.ContainsKey($key) -and $cfg[$key]) { return $cfg[$key] }
  return $fallback
}

$Port = Resolve-Setting "POKECLAW_PORT" "3741"
$Roots = Resolve-Setting "POKECLAW_ROOTS" $HOME
$Token = Resolve-Setting "POKECLAW_TOKEN" ""
$TunnelEnabled = Resolve-Setting "POKECLAW_TUNNEL_ENABLED" "1"

Write-Host ""
Write-Host "PokeClaw - Windows Setup & Launch"
Write-Host "========================================"

# --- Required binaries -------------------------------------------------------
if (-not (Test-Cmd "npx")) {
  Write-Host "Error: 'npx' is not installed. Please install Node.js (https://nodejs.org)." -ForegroundColor Red
  exit 1
}
if (-not (Test-Cmd "rg")) {
  Write-Host "Note: 'rg' (ripgrep) not found - the search_text tool needs it." -ForegroundColor Yellow
  Write-Host "      Install with: winget install BurntSushi.ripgrep.MSVC"
}

# --- Runtime (Bun preferred, Node fallback) ----------------------------------
if (Test-Cmd "bun") {
  $RuntimeExe = "bun"
  $RuntimeArgs = @("run", (Join-Path $ScriptDir "server.ts"))
  Write-Host "Using Bun runtime"
} else {
  $RuntimeExe = "npx"
  $RuntimeArgs = @("ts-node", "--transpile-only", (Join-Path $ScriptDir "server.ts"))
  Write-Host "Bun not found - using Node.js via ts-node"
  $tsNode = Join-Path $ScriptDir "node_modules/.bin/ts-node.cmd"
  if (-not (Test-Path $tsNode)) {
    Write-Host "Installing node dependencies (ts-node, typescript)..."
    Push-Location $ScriptDir
    try { npm install ts-node typescript "@types/node" | Out-Null } finally { Pop-Location }
  }
}

# --- Interactive configuration ----------------------------------------------
if (-not $Quiet) {
  Write-Host ""
  Write-Host "Configuration"
  Write-Host "----------------------------------------"
  $answer = Read-Host "   Port [$Port]"
  if ($answer) { $Port = $answer }
  $answer = Read-Host "   Allowed folders (comma-separated) [$Roots]"
  if ($answer) { $Roots = $answer }
  if ($Token) {
    $answer = Read-Host "   Auth token (leave blank to keep existing)"
    if ($answer) { $Token = $answer }
  } else {
    $answer = Read-Host "   Auth token (recommended - press Enter to skip)"
    if ($answer) { $Token = $answer }
  }
  $answer = Read-Host "   Enable PokeClaw tunnel? [Y/n]"
  if ($answer -and $answer.ToLower().StartsWith("n")) { $TunnelEnabled = "0" } else { $TunnelEnabled = "1" }

  New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
  @(
    "export POKECLAW_PORT='$Port'",
    "export POKECLAW_ROOTS='$Roots'",
    "export POKECLAW_TOKEN='$Token'",
    "export POKECLAW_TUNNEL_ENABLED='$TunnelEnabled'"
  ) | Set-Content -Path $ConfigFile -Encoding utf8
} else {
  Write-Host "Quiet mode - using existing environment and saved config"
}

# --- Poke login check --------------------------------------------------------
if ($TunnelEnabled -eq "1") {
  & npx poke login --check *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "You are not logged in to Poke. Running 'npx poke login'..." -ForegroundColor Yellow
    & npx poke login
  }
}

# --- Launch server + tunnel --------------------------------------------------
$env:POKECLAW_DISABLE_STDIN = "1"
$env:POKECLAW_PORT = $Port
$env:POKECLAW_ROOTS = $Roots
$env:POKECLAW_TOKEN = $Token

$server = Start-Process -FilePath $RuntimeExe -ArgumentList $RuntimeArgs -PassThru -NoNewWindow
Start-Sleep -Seconds 1

Write-Host ""
Write-Host "PokeClaw server is running on port $Port"
Write-Host "    Local URL: http://127.0.0.1:$Port/mcp"

try {
  if ($TunnelEnabled -eq "1") {
    Write-Host ""
    Write-Host "Connecting to Poke tunnel..."
    & npx poke tunnel "http://localhost:$Port" --name pokeclaw
  } else {
    Write-Host "    Tunnel   : disabled"
    Wait-Process -Id $server.Id
  }
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
}
