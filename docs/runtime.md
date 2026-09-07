# Owned runtime and credential migration

Read before installing containers or advancing the Cape Town ownership migration. [Architecture](architecture.md) owns the final topology; [launch evidence](launch-cape-town.md) owns live identifiers and actual device results.

## Ownership and packaging

CDK owns EC2, one ENI with two private IPv4 addresses, two retained EIPs and security groups. Ghostline owns Docker Compose, runtime configuration and installation over verified SSH. Amnezia remains a connection client; do not use its server-management/install actions on the replacement host.

Keep the existing Ubuntu 24.04 AMI, `t3.small` and encrypted 20 GiB disk. The host OS is separate from the containers: the Xray recipe retains Amnezia's Alpine 3.15 family and Xray 26.7.28, while AWG uses a pinned upstream Alpine-based userspace image. See [provenance and exact dependency identities](../runtime/NOTICE.md). Image builds verify Xray's release checksum and pin base digests. Host Docker packages come from Docker's signed Ubuntu repository; this does not claim a bit-for-bit reproducible OS/package build.

Build locally for Linux amd64, save an ordinary installation archive, and transfer it through SSH only when its content-tagged image is absent. Compose references that local tag with pulling disabled. There is no registry, release catalog, image-backup policy or rollback command. ECR with SHA-tagged images is a later direction, not infrastructure introduced here.

Each protocol has its own Compose project and Docker bridge. Publishing and source NAT both use the protocol's private address. Xray exposes only TCP 443; AWG exposes only UDP 443. No wildcard ports, privileged containers, host AWG modules or instance AWS credentials are required. Docker observes foreground process failures and restarts services; normal traffic logging is disabled.

## Local credentials

`npm run runtime cape-town export` captures all six reference Xray files into `.local/recovery/cape-town-runtime.json`: the complete `server.json`, four key/identity files and `clientsTable`. It preserves both existing clients and refuses to overwrite an existing bundle. Installation copies those file bytes unchanged. Source secrets are never printed or passed through command arguments.

The bundle is a protected plaintext local file, not encrypted vault storage. Directory permissions are `0700`, file permissions `0600`; `.local/` is ignored. Anthony saves recovery material in LastPass. The existing dedicated SSH key is still required; host SSH keys are newly verified, not migrated identities. Parameter Store and host secret-fetching plumbing remain deferred.

For AWG, explicit generation creates `.local/recovery/cape-town-awg/awg0.conf`, `macos.conf` and `ios.conf`, each mode `0600`. The server and two peers have independent keys, with a distinct preshared key per peer. Installation never generates or rotates identities. Profiles use Amnezia's inspected 3.1 defaults, UDP 443, MTU 1280, full-device routes including IPv6 capture, and Cloudflare DNS. Actual client DNS/IPv6 protection remains a device test, not a claim from generated text.

## Commands

From `infra/`, with Node 24 selected:

| Command | Effect |
| --- | --- |
| `npm run runtime cape-town export` | Export the reference Xray configuration once before cutover |
| `npm run runtime cape-town build xray` | Build/load/save the pinned amd64 Xray image locally |
| `npm run test:runtime cape-town xray` | Test startup, restart and malformed-configuration exit with disposable credentials |
| `npm run runtime cape-town trust` | Pin staging-address SSH keys from authenticated EC2 console output |
| `npm run runtime cape-town bootstrap` | Install Docker/Compose and verify cloud-init persisted both private addresses |
| `npm run runtime cape-town install xray` | Restore the local bundle and start/reconcile only Xray |
| `npm run runtime cape-town verify xray` | Check state, binding, kernel SNAT, original config and real egress after cutover |
| `npm run runtime cape-town build awg` | Build the pinned userspace AWG image locally |
| `npm run test:runtime cape-town awg` | Test generated 3.1 peer handshake, daemon startup and restart locally |
| `npm run runtime cape-town generate awg` | Generate server and device configurations once, after reference retirement |
| `npm run runtime cape-town install awg` | Install only AWG after the owner checkpoint, retirement and UDP ingress deployment |
| `npm run runtime cape-town verify awg` | Check runtime and network configuration; actual device handshake/browsing is separate |

An optional final positional path selects a different bundle/configuration, for example `npm run runtime cape-town install xray /absolute/path/recovery.json`. No `--` separator is needed. AWS calls use profile `personal`, verify the account, and read live stack/instance metadata instead of trusting stale local outputs. Admin SSH uses the staging/AWG EIP and the target's existing dedicated key. Disconnect the Mac tunnel before administration; do not widen the operator `/32`.

An unchanged installation preserves the container and credentials. A changed image or server-configuration hash makes Compose recreate only that protocol. Secret upload staging is removed in a `finally` block; images contain no credentials. The server copy lives under `/opt/ghostline/<protocol>/config`, mounted read-only. Avoid printing Compose-expanded configuration or server config while diagnosing failures.

## Explicit migration stages

`infra/deployment.json` selects the stage; ordinary deploy never advances it. Run a fresh `npm run diff cape-town` before every authorized deployment.

| Stage | Infrastructure and checkpoint |
| --- | --- |
| `reference` (default for an unchanged recipe) | Original single host and Xray EIP |
| `prepared` | Add distinct managed host/ENI/security group and the staging/AWG EIP; every original resource stays unchanged |
| `cutover` | Replace only the Xray EIP association, moving the retained allocation to the managed host's secondary private address; keep original host |
| `managed` | After Anthony confirms unchanged macOS/iOS profiles pass, delete original host and its security group; retain the shared SSH key and both EIPs |

`awgEnabled` stays false through the Xray checkpoint. After retirement, set it true and deploy UDP 443 ingress, then generate/install AWG. Runtime installation refuses AWG while a reference instance remains. Remove temporary migration stages and their scaffolding after retirement without changing the permanent host, ENI or EIP logical identities.

Before asking for the device checkpoint, verify the EIP allocation is unchanged, test actual egress, reboot the replacement host and repeat runtime installation. The owner then tests the unchanged macOS/iOS profiles. A failed trial means diagnose the current state while the original host remains; no automated fallback or second permanent server is implemented.

After AWG installation, test both protocols and distinct observed exit IPs on both devices, DNS/IPv6 behavior and reboot persistence. Switching is manual between protocols. Do not describe this as automatic failover or infer host availability from two addresses.
