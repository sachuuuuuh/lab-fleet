# Architecture

## Components

Lab Fleet is an npm workspace with three product boundaries:

- `packages/shared`: versioned protocol types, Zod schemas, password hashing, signatures, join proofs, and constants.
- `packages/agent`: persistent state, platform adapters, mDNS, WSS enrollment and presence, local IPC, the system service entry point, and `lab-fleetctl`.
- `apps/desktop`: the sandboxed Electron shell, allowlisted preload API, and React H-node/S-node workflows.

The Electron renderer has no Node integration and cannot read files or open sockets. Requests pass through the preload allowlist to Electron main, then through a Unix socket or Windows named pipe to the background agent.

## Platform boundary

Network schemas and authorization behavior are platform-neutral. Platform adapters provide only local paths, platform identity, service capabilities, and administrator detection.

| Concern | Ubuntu | Windows |
| --- | --- | --- |
| State | `/var/lib/lab-fleet` | `%ProgramData%\LabFleet` |
| UI IPC | `/run/lab-fleet/agent.sock` | `\\.\pipe\lab-fleet-agent` |
| Service | `systemd`, user `labfleet` | WinSW, `LocalService` |
| Installer | `.deb` | per-machine `.msi` |

The agent and control utility are bundled as Node single-executable applications, so target computers do not need Node.js.

## Enrollment protocol

1. An H-node with a lab advertises `_labfleet._tcp.local` with its IDs, names, port, protocol version, and TLS certificate fingerprint.
2. The S-node opens a pinned WSS connection and submits its node ID, username, platform metadata, and Ed25519 public key.
3. The H-node returns a random nonce. The S-node proves knowledge of the temporary code using HMAC over the nonce, host fingerprint, and S-node public-key fingerprint.
4. The H-node rate-limits invalid proofs and exposes a verified request for explicit administrator approval.
5. Approval creates a signed membership binding the host, lab, node, username, and both identity keys.
6. Later sessions use a host challenge signed by the enrolled S-node key. Presence then travels inside the authenticated pinned WSS session.

The temporary code is not advertised or sent to the H-node. Codes expire after five minutes. A source may make at most five failed proofs in ten minutes.

## Persistence

State uses schema-versioned JSON with atomic temporary-file replacement and serialized writes. Passwords use Node's `scrypt` with independent random salts. Ed25519 identity keys and TLS credentials are generated once per installation.

Normal package upgrades preserve state. Revoked node records remain on the H-node so old memberships cannot reconnect. Ubuntu package purge or an explicit administrator reset removes local state.

## Presence

An enrolled S-node maintains one outbound WebSocket, sends heartbeats every ten seconds, and retries a closed session automatically. The H-node marks a node offline after thirty seconds without a heartbeat. Presence includes platform, OS version, agent version, and capability flags; it does not include files, process lists, or student data.

