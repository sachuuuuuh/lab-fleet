# Testing

## Automated checks

Run from the repository root:

```bash
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

After building the Windows application directory, verify the actual Electron package rather than only the browser renderer:

```powershell
npm run smoke:windows-package
```

`npm run package:linux:docker` was exercised on Windows with Docker Desktop and produced `release/desktop/lab-fleet-0.1.1-amd64.deb`. Its control archive was inspected with `dpkg-deb --info` inside the Linux container. This does not replace installation and reboot testing on actual Ubuntu 22.04 and 24.04 systems.

Current automated scenarios:

- Password hashing accepts the correct password and rejects an incorrect password.
- Ed25519 signatures verify canonical payloads and reject modified payloads.
- Join proofs are bound to the code, nonce, certificate fingerprint, and node key.
- A simulated Windows S-node enrolls with an Ubuntu H-node over a real loopback WSS connection.
- The approved S-node validates and stores membership, authenticates a presence session, and appears online.
- An Ubuntu S-node is rejected by a Windows H-node when it submits an incorrect code.
- Agent shutdown does not race with atomic state persistence.

## Installer checks

Windows CI must:

1. Build the standalone Windows agent and control executables.
2. Build the Electron `win-unpacked` directory.
3. Compile and link the WiX MSI.
4. Install the MSI on Windows 10 and Windows 11 test machines.
5. Confirm `LabFleetAgent` starts as `LocalService`, restarts after failure, and starts after reboot.
6. Confirm repair, upgrade, downgrade rejection, uninstall, and preserved `%ProgramData%\LabFleet` state.
7. Confirm the setup wizard offers install-directory, progress, completion, maintenance, and removal screens.
8. Confirm Lab Fleet is present in Windows Installed Apps and both Start Menu shortcuts work.

Ubuntu CI or a clean VM must:

1. Build the DEB on Ubuntu 22.04.
2. Inspect it with `dpkg-deb --info`.
3. Install on Ubuntu 22.04 and 24.04.
4. Confirm `lab-fleet-agent.service` runs as `labfleet` and starts after reboot.
5. Confirm upgrade and uninstall preserve state while package purge removes it.

## Two-computer acceptance test

Use fictional school, administrator, and laptop names.

1. Install the native package on both physical computers.
2. Configure one H-node and one S-node.
3. Verify automatic mDNS discovery over school Wi-Fi.
4. Verify a wrong code is rejected without creating a pending request.
5. Verify the correct code creates exactly one named pending request.
6. Reject once and verify the S-node returns to the unlinked state.
7. Request again, approve, and verify both devices show the connected state.
8. Close the S-node UI and verify it remains online.
9. Reboot the S-node and verify automatic reconnection without a password.
10. Reboot the H-node and verify the S-node reconnects.
11. Revoke the S-node while connected and verify it becomes unlinked.
12. Re-enroll, take the S-node offline, revoke it, then verify its later connection is rejected.
13. Verify password-protected local unlink accepts the correct password and rejects a wrong password.
14. Capture the exact package versions, test date, operating systems, and pass/fail results in `DEVELOPMENT_LOG.md`.

The physical two-computer acceptance test has not yet been performed in this workspace and must not be reported as passed.
