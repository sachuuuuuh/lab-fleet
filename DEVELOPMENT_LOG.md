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

Verified commands:

- `npm run build -w @lab-fleet/shared` - passed.
- `npm run typecheck -w @lab-fleet/agent` - passed.
- `npm run typecheck -w @lab-fleet/desktop` - passed after configuration fixes.
- `npm test` - 5 tests passed.
- `npm audit --omit=dev` - 0 production vulnerabilities.
- `npm run build:agent-binaries` - created and launched the Windows SEA agent.
- `npm run package:windows:app -w @lab-fleet/desktop` - created the Windows Electron directory.
- `scripts/build-windows-msi.ps1` - compiled the unsigned development MSI.

Not yet verified:

- Ubuntu DEB build and installation on native Ubuntu.
- MSI installation, service startup, repair, upgrade, uninstall, and reboot on Windows 10/11.
- Real two-computer mDNS discovery and mixed-OS enrollment.
- GPT-5.6 integration.

