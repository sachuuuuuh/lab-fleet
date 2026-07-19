$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$agentDir = Join-Path $root "release\agent\win"
New-Item -ItemType Directory -Force -Path $agentDir | Out-Null

$winSwVersion = "2.12.0"
$winSwUrl = "https://github.com/winsw/winsw/releases/download/v$winSwVersion/WinSW-x64.exe"
Invoke-WebRequest -Uri $winSwUrl -OutFile (Join-Path $agentDir "LabFleetAgentService.exe")
Copy-Item (Join-Path $root "packaging\windows\LabFleetAgentService.xml") $agentDir
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/winsw/winsw/v$winSwVersion/LICENSE.txt" -OutFile (Join-Path $agentDir "WinSW-LICENSE.txt")

