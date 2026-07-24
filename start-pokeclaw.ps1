<#
  PokeClaw - Windows Onboarding & Launch Script  🌴

  Installs dependencies and hands off to the `pokeclaw` CLI
  (onboarding wizard + live TUI dashboard).

  Usage:
    powershell -ExecutionPolicy Bypass -File start-pokeclaw.ps1
    powershell -ExecutionPolicy Bypass -File start-pokeclaw.ps1 -Quiet
#>
param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigDir = Join-Path $env:USERPROFILE ".pokeclaw"
$ConfigFile = Join-Path $ConfigDir "config.json"

function Have($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

Write-Host ""
Write-Host "🌴  PokeClaw - Windows Setup & Launch"
Write-Host "----------------------------------------"

# Runtime
$Runtime = $null
if (Have "bun") {
  $Runtime = "bun"
  Write-Host "OK  Bun detected"
} elseif (Have "node") {
  $Runtime = "node"
  Write-Host "OK  Node $(node --version) detected"
} else {
  Write-Error "Node.js 18+ or Bun is required. Install Node from https://nodejs.org and re-run."
  exit 1
}

# cloudflared (optional)
if (Have "cloudflared") {
  Write-Host "OK  cloudflared detected"
} elseif (Have "winget") {
  Write-Host "Step - Installing cloudflared via winget..."
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
} else {
  Write-Host "!!  cloudflared not found. Install it to expose PokeClaw:"
  Write-Host "    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
}

# Dependencies + build
Push-Location $ScriptDir
try {
  if ($Runtime -eq "bun") {
    Write-Host "Step - Installing dependencies (bun)..."
    bun install | Out-Null
    $Run = @("bun", "run", (Join-Path $ScriptDir "src\cli.ts"))
  } else {
    Write-Host "Step - Installing dependencies + building (node)..."
    npm install | Out-Null
    npm run build | Out-Null
    $Run = @("node", (Join-Path $ScriptDir "dist\cli.js"))
  }
  Write-Host "OK  Ready"

  if (-not $Quiet -and -not (Test-Path $ConfigFile)) {
    & $Run[0] $Run[1..($Run.Length - 1)] onboard
  }

  & $Run[0] $Run[1..($Run.Length - 1)] start
} finally {
  Pop-Location
}
