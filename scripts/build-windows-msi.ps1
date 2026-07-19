$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$productVersion = (Get-Content (Join-Path $root "package.json") | ConvertFrom-Json).version
$desktopDir = Join-Path $root "release\desktop\win-unpacked"
$agentDir = Join-Path $root "release\agent\win"
$wixOut = Join-Path $root "release\wix"
$msiOut = Join-Path $root "release\lab-fleet-$productVersion-x64.msi"
$wixDir = Join-Path $root "release\tools\wix314"
$licenseRtf = Join-Path $root "packaging\windows\License.rtf"

if (-not (Test-Path $desktopDir)) { throw "Windows desktop bundle was not found at $desktopDir" }
if (-not (Test-Path (Join-Path $agentDir "LabFleetAgentService.exe"))) { throw "Run prepare-windows-agent.ps1 first." }
if (-not (Test-Path (Join-Path $wixDir "candle.exe"))) { throw "Run prepare-wix.ps1 first." }

New-Item -ItemType Directory -Force -Path $wixOut | Out-Null
& (Join-Path $wixDir "heat.exe") dir $desktopDir -nologo -ag -sfrag -srd -sreg -scom -dr INSTALLFOLDER -cg DesktopFiles -var var.DesktopDir -out (Join-Path $wixOut "DesktopFiles.wxs")
if ($LASTEXITCODE -ne 0) { throw "WiX heat failed with exit code $LASTEXITCODE" }
& (Join-Path $wixDir "candle.exe") -nologo -arch x64 -ext WixUIExtension -ext WixUtilExtension -ext WixFirewallExtension "-dDesktopDir=$desktopDir" "-dAgentDir=$agentDir" "-dLicenseRtf=$licenseRtf" "-dProductVersion=$productVersion" -out (Join-Path $wixOut "Product.wixobj") (Join-Path $root "packaging\windows\Product.wxs")
if ($LASTEXITCODE -ne 0) { throw "WiX candle failed for Product.wxs with exit code $LASTEXITCODE" }
& (Join-Path $wixDir "candle.exe") -nologo -arch x64 "-dDesktopDir=$desktopDir" -out (Join-Path $wixOut "DesktopFiles.wixobj") (Join-Path $wixOut "DesktopFiles.wxs")
if ($LASTEXITCODE -ne 0) { throw "WiX candle failed for DesktopFiles.wxs with exit code $LASTEXITCODE" }
& (Join-Path $wixDir "light.exe") -nologo -sval -ext WixUIExtension -ext WixUtilExtension -ext WixFirewallExtension -cultures:en-us -out $msiOut (Join-Path $wixOut "Product.wixobj") (Join-Path $wixOut "DesktopFiles.wixobj")
if ($LASTEXITCODE -ne 0) { throw "WiX light failed with exit code $LASTEXITCODE" }

Write-Host "Built $msiOut"
