$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$agentDir = Join-Path $root "release\agent\win"
New-Item -ItemType Directory -Force -Path $agentDir | Out-Null

$winSwVersion = "2.12.0"
function Save-Download {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$OutFile
  )

  try {
    Invoke-WebRequest -Uri $Uri -OutFile $OutFile
  }
  catch {
    if (Test-Path $OutFile) {
      Write-Warning "Could not refresh $OutFile; reusing the existing cached copy. $($_.Exception.Message)"
      return
    }

    throw
  }
}

$winSwUrl = "https://github.com/winsw/winsw/releases/download/v$winSwVersion/WinSW-x64.exe"
Save-Download -Uri $winSwUrl -OutFile (Join-Path $agentDir "LabFleetAgentService.exe")
Copy-Item (Join-Path $root "packaging\windows\LabFleetAgentService.xml") $agentDir
Save-Download -Uri "https://raw.githubusercontent.com/winsw/winsw/v$winSwVersion/LICENSE.txt" -OutFile (Join-Path $agentDir "WinSW-LICENSE.txt")
