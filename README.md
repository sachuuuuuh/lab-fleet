# Lab Fleet

Lab Fleet is a cross-platform desktop application for enrolling and monitoring school-owned computers on one local network. The same application can be configured as an H-node (host) or S-node (student computer), and Windows and Ubuntu devices can be mixed in either role.

Feature 1 implements secure lab creation, discovery, enrollment approval, signed membership, online presence, automatic reconnection, revocation, and local credential protection. It does **not** yet implement shutdown, file transfer, application launching, or GPT-5.6 diagnostics.

## Supported platforms

- Windows 10 or 11, x64
- Ubuntu 22.04 or 24.04, amd64
- A LAN or Wi-Fi network that permits peer-to-peer TCP and mDNS traffic

## Feature 1 workflow

1. Install Lab Fleet on both computers with administrator privileges.
2. Configure one computer as an H-node and register the school administrator profile.
3. Create one lab group and open enrollment to obtain a five-minute code.
4. Configure the other computer as an S-node and register its laptop credentials.
5. Select the discovered lab, enter the code, and approve the named request on the H-node.
6. The S-node stores its signed membership and reconnects automatically after the UI closes or the computer restarts.
7. Either unlink locally with the S-node password or revoke the device from the H-node.

All credentials and enrollment data stay on the respective devices. Lab Fleet does not require an internet connection after installation.

## Development

Prerequisites:

- Node.js 22.20 or newer
- npm 10 or newer

Install, verify, and start the development application:

```bash
npm install
npm run typecheck
npm test
npm run dev
```

Development state is written under the operating system temporary directory in `lab-fleet-dev/agent`. It never uses production state directories.

## Build artifacts

Build the shared libraries, agent, and desktop application:

```bash
npm run build
```

Build the Windows application directory and standalone service executables:

```powershell
npm run package:windows:app
./scripts/prepare-windows-agent.ps1
./scripts/prepare-wix.ps1
./scripts/build-windows-msi.ps1
```

The MSI is written to `release/lab-fleet-0.1.5-x64.msi`. It includes a guided install/maintenance wizard and is unsigned unless signing credentials are supplied by the release environment. Build it locally once, then copy the same MSI to every Windows x64 lab computer.

Build the Ubuntu package in GitHub Actions by running the **Build Ubuntu DEB** workflow from the repository's Actions tab. The workflow runs on Ubuntu 22.04, builds the package natively, inspects the DEB contents, installs it for a local service smoke test, and uploads only the reusable `lab-fleet-ubuntu-amd64` DEB artifact. Artifacts are retained for three days to avoid storing old release files.

For maintainers on an Ubuntu build machine, the same native package command remains:

```bash
npm run package:linux
```

The DEB is written under `release/desktop/` when built on Ubuntu. For normal distribution, download the GitHub Actions artifact once and copy that DEB to every Ubuntu amd64 lab computer; client computers do not need Node.js, npm, Docker, or the source repository.

## Installation

Windows:

```powershell
msiexec /i lab-fleet-0.1.5-x64.msi
```

The per-machine MSI provides a guided setup wizard, installs the desktop application, starts `LabFleetAgent` as an automatic `LocalService`, preserves `%ProgramData%\LabFleet` across normal uninstall, and opens only TCP 45820 and UDP 5353 on Domain and Private firewall profiles. Remove it through **Settings > Apps > Installed apps > Lab Fleet**, by opening the MSI again and choosing **Remove**, or from the **Uninstall Lab Fleet** Start Menu shortcut.

On a Windows H-node, the active network profile must be **Domain** or **Private** for those firewall rules to apply. If Windows marks the Wi-Fi as **Public**, discovery and joining may be blocked until the network profile is changed or an administrator opens the equivalent rules.

Ubuntu:

```bash
sudo apt install ./lab-fleet-0.1.5-amd64.deb
```

The package installs and starts `lab-fleet-agent.service`. Log out and back in if the installer adds the current desktop user to the `labfleet` group. When UFW blocks discovery or hosting, print the explicit rules with:

```bash
lab-fleetctl firewall
```

If the Ubuntu app reports that it cannot connect to `/run/lab-fleet/agent.sock`, check and restart the background service:

```bash
systemctl status lab-fleet-agent.service
sudo journalctl -u lab-fleet-agent.service -n 80 --no-pager
sudo systemctl restart lab-fleet-agent.service
```

For early development packages that fail before creating the socket, add this local systemd override, restart the service, then reopen Lab Fleet:

```bash
sudo mkdir -p /etc/systemd/system/lab-fleet-agent.service.d
printf '[Service]\nExecStart=\nExecStart="/opt/Lab Fleet/resources/agent/lab-fleet-agent"\nMemoryDenyWriteExecute=false\nRuntimeDirectoryMode=0755\n' | sudo tee /etc/systemd/system/lab-fleet-agent.service.d/local-fix.conf
sudo systemctl daemon-reload
sudo systemctl restart lab-fleet-agent.service
```

If the service is running but access is denied, add the desktop user to the local agent group and sign out and back in:

```bash
sudo usermod -aG labfleet "$USER"
```

If an S-node does not discover the H-node automatically, open enrollment on the H-node and use one of the displayed `IP:port` values with **Connect by IP address** on the S-node. This avoids multicast/mDNS restrictions on school Wi-Fi while keeping the same join-code and approval flow.

## Recovery

There is no network password recovery. A local machine administrator can deliberately remove the device identity, role, and enrollment:

```bash
sudo lab-fleetctl reset
```

On Windows, run `lab-fleetctl.exe reset` from an elevated terminal. The command requires the exact confirmation phrase before deleting state.

## Testing

Run all automated tests with `npm test`. The suite includes cryptographic unit tests and a real loopback integration flow where a simulated Windows S-node joins an Ubuntu H-node over WSS, receives a signed membership, and becomes online. See [TESTING.md](TESTING.md) for the full matrix and real-device checklist.

## Codex and GPT-5.6

Codex created the Feature 1 architecture, protocol, application, tests, packaging definitions, and documentation in the primary build task. Human decisions included the product concept, school-owned device boundary, local-only accounts, Ubuntu and Windows support, mixed-OS roles, MSI packaging, and fleet diagnostics as the intended GPT-5.6 feature.

GPT-5.6 is **not integrated in Feature 1**. Lab Fleet must not be described as submission-ready until the diagnostics milestone is implemented, tested, and shown accurately.

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Security](SECURITY.md)
- [Testing](TESTING.md)
- [Development log](DEVELOPMENT_LOG.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## License

Lab Fleet is released under the [MIT License](LICENSE).
