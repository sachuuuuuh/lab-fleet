$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $root "release\tools"
$wixDir = Join-Path $toolsDir "wix314"
$archive = Join-Path $toolsDir "wix314-binaries.zip"

if (Test-Path (Join-Path $wixDir "candle.exe")) {
  Write-Host "WiX 3.14.1 is already available."
  exit 0
}

New-Item -ItemType Directory -Force -Path $wixDir | Out-Null
Invoke-WebRequest -Uri "https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip" -OutFile $archive
Expand-Archive -Path $archive -DestinationPath $wixDir -Force
Remove-Item -LiteralPath $archive
Write-Host "Prepared portable WiX 3.14.1 in $wixDir"

