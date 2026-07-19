# Changelog

## 0.1.4 - 2026-07-19

- Fixed Windows MSI firewall rules to target the actual `lab-fleet-agent.exe` listener instead of the WinSW wrapper.
- Added defensive S-node enrollment handling for invalid, closed, or interrupted H-node connections.

## 0.1.3 - 2026-07-19

- Made S-node discovery wait briefly for mDNS replies instead of returning an empty list immediately after scan starts.
- Hardened mDNS parsing for TXT records and IPv4-mapped addresses seen on real networks.
- Added H-node LAN address and port display during enrollment so S-nodes can use manual IP joining when multicast is blocked.
- Clarified the S-node empty discovery state and manual IP fallback.

## 0.1.2 - 2026-07-19

- Fixed the Ubuntu agent service so the quoted Node SEA executable can start and create `/run/lab-fleet/agent.sock`.
- Made the Ubuntu local IPC socket accessible to the desktop UI while keeping protected commands credential-gated.
- Improved desktop error handling for missing agent sockets, unavailable services, and expired unlock sessions.
- Moved Ubuntu DEB production to the GitHub Actions **Build Ubuntu DEB** workflow.
- Removed the local Docker-based Ubuntu package build path.

## 0.1.1 - 2026-07-19

- Fixed the packaged Electron white screen by emitting a CommonJS sandbox preload.
- Added a visible startup recovery state and local desktop lifecycle diagnostics.
- Added a guided Windows install-directory and maintenance wizard.
- Added Installed Apps metadata, an uninstall Start Menu shortcut, and cleaner binary removal.
- Moved WinSW logs to the writable Lab Fleet data directory.
- Added a Windows Docker workflow that builds one reusable Ubuntu amd64 DEB.
- Added a packaged Windows preload/renderer smoke test.

## 0.1.0 - 2026-07-19

- Added shared H-node and S-node desktop application.
- Added cross-platform mDNS discovery and manual IP fallback.
- Added temporary code proof and explicit host enrollment approval.
- Added signed device memberships and pinned authenticated WSS sessions.
- Added online presence, automatic reconnection, and revocation.
- Added local account protection and administrator reset utility.
- Added Ubuntu systemd/DEB and Windows service/MSI packaging definitions.
- Added automated cryptographic and mixed-platform integration tests.
