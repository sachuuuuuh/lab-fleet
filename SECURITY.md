# Security

## Security boundary

Feature 1 is intended for school-owned computers on a trusted school LAN. It protects enrollment and membership against unauthenticated nearby devices and network interception. It does not claim to defend a computer that is already controlled by a local administrator or malware.

## Implemented controls

- Local-only credential storage with salted `scrypt` hashes.
- Ed25519 device identities and signed memberships.
- TLS-encrypted WebSockets with certificate pinning.
- Code-authenticated enrollment proof bound to the TLS fingerprint and S-node key.
- Five-minute codes, explicit H-node approval, replay-resistant nonces, and failed-proof rate limiting.
- Fifteen-minute local authenticated sessions for sensitive IPC methods.
- Renderer sandboxing, context isolation, no Node integration, and an allowlisted preload API.
- Atomic state writes and restrictive Ubuntu state-file permissions.
- Unprivileged Linux and Windows services for Feature 1.
- No telemetry, cloud accounts, remote internet control, or collection of real student information.

## Operational requirements

- Install packages only from the project's release artifacts.
- Sign production MSI and DEB artifacts before real deployment.
- Keep the H-node administrator password and S-node unlink password private.
- Use a private school network that does not expose TCP 45820 to the public internet.
- Permit mDNS only on the intended local network.
- Revoke retired computers before reimaging or disposal.

## Known limitations

- An unsigned development MSI may trigger Windows warnings and is not suitable for production deployment.
- Manual IP pairing uses the certificate fingerprint observed during that code-authenticated session; discovery supplies the expected fingerprint before connection.
- Local users who can administer the operating system can stop the service, read state, or reset enrollment.
- There is no password recovery. Local administrator reset is intentionally destructive.
- Service installation and reboot behavior still require validation on the two physical target computers.
- Remote shutdown, file transfer, and application launch require a separately reviewed privileged-helper design and are not present.

Report security issues privately to the repository owner. Do not include real credentials, keys, or student data in reports.

