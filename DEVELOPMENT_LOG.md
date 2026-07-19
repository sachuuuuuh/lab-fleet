# Development Log

## 2026-07-19 - Feature 1 implementation

Human product decisions:

- School-owned fixed lab computers only; no student-owned devices.
- Local network and local credentials only.
- One H-node group and one S-node membership in Feature 1.
- Ubuntu 22.04/24.04 amd64 and Windows 10/11 x64.
- Either role may run on either operating system.
- Windows distribution uses a per-machine MSI.
- GPT-5.6 will later provide fleet diagnostics rather than command generation.

Codex implementation work:

- Initialized the npm workspace architecture.
- Implemented cryptography, protocol schemas, state persistence, platform adapters, mDNS, WSS enrollment, membership, presence, revocation, IPC, CLI recovery, Electron UI, installer definitions, CI, and documentation.
- Added unit and mixed-platform integration tests.
- Visually verified host and first-run workflows at 1440x900 and 375x800.
- Built and launched the standalone Windows agent executable.
- Built the Windows Electron directory and compiled `lab-fleet-0.1.0-x64.msi`.
- Reproduced the packaged white screen and captured `Cannot use import statement outside a module` from Electron's sandboxed preload loader.
- Changed the preload bundle to CommonJS, added a startup recovery screen, and verified the packaged renderer exposes `window.labFleet` and renders visible role-selection content.
- Added a standard WiX setup/maintenance wizard, Installed Apps metadata, an uninstall shortcut, and empty-folder cleanup for version 0.1.1.
- Added `npm run package:linux:docker` so one Ubuntu package can be built from Windows and distributed to all compatible Ubuntu computers.
- Built `lab-fleet-0.1.1-amd64.deb` from Windows with Docker Desktop and inspected its Debian control metadata; native installation on Ubuntu remains a separate acceptance test.
- Installed, launched, uninstalled, cleanup-checked, and reinstalled the 0.1.1 MSI. Windows Installed Apps registration, both Start Menu shortcuts, automatic service startup, renderer startup, and preserved enrollment state were verified.
- Fixed the Ubuntu service definition for version 0.1.2 by removing `MemoryDenyWriteExecute=true`, setting `RuntimeDirectoryMode=0755`, and making the Unix IPC socket accessible to the desktop UI.
- Improved desktop handling for expired unlock sessions and missing local agent sockets.
- Replaced the local Docker DEB builder with the GitHub Actions **Build Ubuntu DEB** workflow. Windows MSI production remains local for now.

Verified commands:

- `npm run build -w @lab-fleet/shared` - passed.
- `npm run typecheck -w @lab-fleet/agent` - passed.
- `npm run typecheck -w @lab-fleet/desktop` - passed after configuration fixes.
- `npm test` - 5 tests passed.
- `npm audit --omit=dev` - 0 production vulnerabilities.
- `npm run build:agent-binaries` - created and launched the Windows SEA agent.
- `npm run package:windows:app -w @lab-fleet/desktop` - created the Windows Electron directory.
- `scripts/build-windows-msi.ps1` - compiled the unsigned development MSI.
- `npm run typecheck` - passed after the Ubuntu service and desktop error-handling fixes.
- `npm test` - 5 tests passed after the Ubuntu service and desktop error-handling fixes.
- `npm run build` - passed after the Ubuntu service and desktop error-handling fixes.

Not yet verified:

- GitHub Actions production of `lab-fleet-0.1.2-amd64.deb`.
- Ubuntu DEB installation, service startup, UI-to-agent socket access, upgrade, uninstall, purge, and reboot on native Ubuntu 22.04/24.04.
- MSI 0.1.2 installation, service startup, repair, upgrade, uninstall, and reboot on Windows 10/11.
- Real two-computer mDNS discovery and mixed-OS enrollment.
- GPT-5.6 integration.
