# Legacy Ubuntu runtime and client profiles

Read before installing containers or changing a regional deployment. [Architecture](architecture.md) owns the final topology; [launch records](README.md) own live identifiers and actual device results.

This document describes the Ubuntu/SSH/Compose workflow retained by Cape Town and historical recipes. **Stockholm's primary uses [ECS](ecs.md) under target `stockholm-ecs`.** The `stockholm` examples below record the retired Ubuntu launch and preserved credential-source paths; they are not instructions to recreate it. Use current ECS exports for Stockholm clients.

## Ownership and packaging

CDK owns EC2, one ENI with two private IPv4 addresses, two retained EIPs and security groups. Ghostline owns Docker Compose, runtime configuration and installation over verified SSH. Amnezia remains a connection client; do not use its server-management/install actions on the replacement host.

Keep the existing Ubuntu 24.04 AMI, `t3.small` and encrypted 20 GiB disk. The host OS is separate from the containers: the Xray recipe retains Amnezia's Alpine 3.15 family and Xray 26.7.28, while AWG uses a pinned upstream Alpine-based userspace image. See [provenance and exact dependency identities](../runtime/NOTICE.md). Image builds verify Xray's release checksum and pin base digests. Host Docker packages come from Docker's signed Ubuntu repository; this does not claim a bit-for-bit reproducible OS/package build.

Build locally for Linux amd64, save an ordinary installation archive, and transfer it through SSH only when its content-tagged image is absent. Compose references that local tag with pulling disabled. There is no registry, release catalog, image-backup policy or rollback command. ECS uses separate ECR delivery; it does not change this legacy workflow.

Each protocol has its own Compose project and Docker bridge. Publishing and source NAT both use the protocol's private address. Xray exposes only TCP 443; AWG exposes only UDP 443. No wildcard ports, privileged containers, host AWG modules or instance AWS credentials are required. Docker observes foreground process failures and restarts services; normal traffic logging is disabled.

## Local credentials

`npm run runtime cape-town export` captures all six Xray files into `.local/recovery/cape-town-runtime.json`: the complete `server.json`, four key/identity files and `clientsTable`. It preserves both existing clients and refuses to overwrite an existing bundle. Installation copies those file bytes unchanged. Source secrets are never printed or passed through command arguments.

The bundle is a protected plaintext local file, not encrypted vault storage. Directory permissions are `0700`, file permissions `0600`; `.local/` is ignored. Anthony saves recovery material in LastPass. The existing dedicated SSH key is still required; host SSH keys are newly verified, not migrated identities. Cape Town Parameter Store migration remains deferred; Stockholm uses the [implemented regional store](secrets.md).

For AWG, explicit generation creates `.local/recovery/cape-town-awg/awg0.conf`, `macos.conf` and `ios.conf`, each mode `0600`. The server and two peers have independent keys, with a distinct preshared key per peer. Installation never generates or rotates identities. Profiles use Amnezia's inspected 3.1 defaults, UDP 443, MTU 1280, full-device routes including IPv6 capture, and Cloudflare DNS. Actual client DNS/IPv6 protection remains a device test, not a claim from generated text.

For a fresh owned deployment, `npm run runtime stockholm generate xray` creates `.local/recovery/stockholm-runtime.json` and per-device JSON profiles in `.local/recovery/stockholm-runtime.json.clients/`. It creates a fresh REALITY key pair, short ID and separate macOS/iOS UUIDs using the inspected reference settings. `generate awg` creates the corresponding Stockholm AWG directory. Both refuse to overwrite existing credentials. Generate once; restore the same files after parking/rebuilding. Export remains the path for preserving an existing Xray installation.

## Commands

From `infra/`, with Node 24 selected:

| Command | Effect |
| --- | --- |
| `npm run runtime stockholm generate xray` | Create independent server identity and two client profiles for a new regional endpoint |
| `npm run runtime stockholm share xray` | Derive local VLESS link files and QR images from existing client JSON |
| `npm run runtime cape-town export` | Export the current Xray configuration to a new protected bundle |
| `npm run runtime cape-town build xray` | Build/load/save the pinned amd64 Xray image locally |
| `npm run test:runtime cape-town xray` | Test startup, restart and malformed-configuration exit with disposable credentials |
| `npm run runtime cape-town trust` | Pin admin/AWG-address SSH keys from authenticated EC2 console output |
| `npm run runtime cape-town bootstrap` | Install Docker/Compose and verify cloud-init persisted both private addresses |
| `npm run runtime cape-town install xray` | Restore the local bundle and start/reconcile only Xray |
| `npm run runtime cape-town verify xray` | Check state, binding, kernel SNAT, original config and real egress after cutover |
| `npm run runtime cape-town build awg` | Build the pinned userspace AWG image locally |
| `npm run test:runtime cape-town awg` | Test generated 3.1 peer handshake, daemon startup and restart locally |
| `npm run runtime cape-town generate awg` | Generate server and device configurations once, for the managed deployment |
| `npm run runtime cape-town share awg` | Derive local VPN-link files and native-config QR images for both peers |
| `npm run runtime cape-town install awg` | Install only AWG after UDP ingress deployment |
| `npm run runtime cape-town verify awg` | Check runtime and network configuration; actual device handshake/browsing is separate |

An optional final positional path selects a different bundle/configuration, for example `npm run runtime cape-town install xray /absolute/path/recovery.json`. No `--` separator is needed. AWS calls use profile `personal`, verify the account, and read live stack/instance metadata instead of trusting stale local outputs. Admin SSH uses the staging/AWG EIP and the target's existing dedicated key. Disconnect the Mac tunnel before administration; do not widen the operator `/32`.

An unchanged installation preserves the container and credentials. A changed image or server-configuration hash makes Compose recreate only that protocol. Secret upload staging is removed in a `finally` block; images contain no credentials. The server copy lives under `/opt/ghostline/<protocol>/config`, mounted read-only. Avoid printing Compose-expanded configuration or server config while diagnosing failures.

## Deployment and client imports

Cape Town and the retired Ubuntu Stockholm recipe use `runtime: { "awgEnabled": true }`. A catalog entry without `runtime` retains the original single-address reference recipe; Frankfurt is not deployed. Temporary migration stages are retired and rejected by validation. Keep the permanent host, ENI, retained EIP and SSH key logical identities stable. AWS KeyPair tag changes require replacement, so the existing unbilled key keeps its historical `System=xray` tag.

Run a fresh `npm run diff cape-town` before every authorized deployment. Enabling AWG changes only UDP 443 ingress. Runtime install reconciles each protocol independently on the same host.

Run `share awg` after generation. Import `macos.vpn` through AmneziaVPN → plus → File with connection settings. This compressed `vpn://` link contains native AWG configuration, not server-management credentials. The Mac import was accepted by AmneziaVPN 5.0.1.5. Native `.conf` files are also accepted by the upstream parser.

For iOS, open `.local/recovery/cape-town-awg/ios-qr.png` on the Mac and scan it using AmneziaVPN's connection QR importer. The QR encodes native configuration directly; the app's QR and text-link paths differ. Alternatively transfer `ios.vpn` or `ios.conf` locally and import it. Use separate peer profiles on each device. Generated links and QR images contain credentials and inherit protected local file permissions; no online QR service is used.

After installation, test both protocols and distinct observed exit IPs on both devices, DNS/IPv6 behavior and reboot persistence. Switching is manual between protocols. Do not describe this as automatic failover or infer host availability from two addresses. Historical migration checkpoints are recorded in the launch evidence.

## Fresh regional launch / rebuild

After the scoped CDK deployment, run the following for the selected target (Stockholm shown):

```sh
npm run runtime stockholm build xray
npm run runtime stockholm build awg
npm run runtime stockholm trust
npm run runtime stockholm bootstrap
# First launch only; omit both generate commands when restoring saved identity.
npm run runtime stockholm generate xray
npm run runtime stockholm generate awg
npm run runtime stockholm install xray
npm run runtime stockholm install awg
npm run runtime stockholm verify xray
npm run runtime stockholm verify awg
npm run runtime stockholm share xray
npm run runtime stockholm share awg
```

Fresh Xray `.vpn` files contain standard `vless://` links, supported by Amnezia 5.0.1.5's native importer. They include the device UUID, public REALITY key, short ID and endpoint, without the server private key or SSH credentials. Xray QR images encode the same VLESS link. AWG retains its verified native-config QR/compressed-link formats. Import the target's `macos.vpn` through plus → File with connection settings; Anthony imports each `ios-qr.png` using the iPhone QR scanner. Keep Cape Town profiles while testing Stockholm.

After a parked deployment is rebuilt, existing EIPs and client credentials remain valid. `trust` can replace the prior SSH pin only from the authenticated console of the currently verified instance, retaining a local `.previous` file; it never uses unauthenticated `ssh-keyscan`. Then bootstrap and install both protocols from the preserved local files. The runtime generates new Compose bindings for the new private addresses. `deploy` alone does not install containers or restore credentials.
