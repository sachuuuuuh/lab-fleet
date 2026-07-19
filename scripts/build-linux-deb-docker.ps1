$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$image = "lab-fleet-deb-builder:node22"
$nodeModulesVolume = "lab-fleet-linux-node-modules"

function Stop-Build([string]$message) {
  Write-Host "ERROR: $message" -ForegroundColor Red
  exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Stop-Build "Docker Desktop is required. Install it and switch to Linux containers."
}

$previousErrorAction = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$dockerOs = & docker info --format "{{.OSType}}" 2>$null
$dockerInfoExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorAction
if ($dockerInfoExitCode -ne 0) {
  Stop-Build "Docker Desktop is not running. Start Docker Desktop and try again."
}
if ($dockerOs.Trim() -ne "linux") {
  Stop-Build "Docker Desktop must be using Linux containers to build the Ubuntu package."
}

& docker build --file (Join-Path $root "packaging\linux\Dockerfile") --tag $image $root
if ($LASTEXITCODE -ne 0) { Stop-Build "The Linux builder image failed to build." }

& docker run --rm `
  --mount "type=bind,source=$root,target=/workspace" `
  --mount "type=volume,source=$nodeModulesVolume,target=/workspace/node_modules" `
  --workdir /workspace `
  $image `
  sh -lc "npm ci && npm run typecheck && npm test && npm run package:linux"
if ($LASTEXITCODE -ne 0) { Stop-Build "The Ubuntu package build failed." }

$packages = Get-ChildItem (Join-Path $root "release\desktop\*.deb") -ErrorAction SilentlyContinue
if (-not $packages) { Stop-Build "The build completed without producing a DEB package." }
$packages | ForEach-Object { Write-Host "Built $($_.FullName)" }
