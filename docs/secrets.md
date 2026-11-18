# Regional secrets

Each maintained region stores six existing engine/device SecureStrings at identical `/ghostline/prod` paths. DERP provisioning adds one server SecureString and one public pin String. Region belongs to the AWS client/ARN, not the path. A validated private trial catalog may select `/ghostline/trial/<name>` for gateway identities; the regional release-alert contact retains its fixed `/ghostline/prod/alerts/email` path. Parameter Store is the application source; local exports are convenience copies that can be recreated while parameters remain available. No independent backup or LastPass closeout is required. Endpoint removal never deletes parameters.

| Parameter suffix under `/ghostline/prod/` | Value |
| --- | --- |
| `server/xray` | JSON envelope containing base64 `files["server.json"]`; preserve any existing companion metadata |
| `server/awg` | Native AWG server configuration |
| `clients/macos/xray`, `clients/ios/xray` | Native Xray client JSON, with separate device UUIDs |
| `clients/macos/awg`, `clients/ios/awg` | Native AWG device configs with independent private keys |
| `server/derp` | Provisioned IP-SAN certificate, matching TLS private key and stable DERP server key; SecureString |
| `derp/public` | Public IP, exact leaf-certificate SHA256 pin and expiry; String, no private material |

REALITY server private keys, VLESS UUIDs, short IDs, AWG private/preshared keys and HeaderProtectionKey remain protected within these values. Public keys, addresses and tuning values are not independently secrets, but complete configs, links and QR images are credential copies. The engines do not need AWG client private keys.

## ECS delivery and threat boundary

The implemented delivery recipe gives the shared gateway task exact `ssm:GetParameters` access to the configured Xray/AWG/DERP server ARNs. Its ECS trust is restricted to the owning regional account, following AWS’s supported source-account/source-ARN scope. ECS receives only public ARN references. `gateway-config` retrieves values with the pinned official SDK directly into RAM and passes each renderer a private stdin pipe. It makes two complete version/value-consistent reads, rejects incomplete sets and refuses disk-backed config storage or host swap before fetching. Core dumps are disabled; errors are fixed text and SDK output is suppressed. The host and execution roles have no application parameter-read grants. Use the default regional SSM key and no recursive parent-path grant.

Task-role authority belongs to **every container in the task**. ECS exposes its opaque credential locator to each container. Network rules allow only the kernel-correlated, currently leased initializer to contact that endpoint; engine/DNS namespaces remain blocked. The initializer has bounded private DNS/public TLS egress and loses authority on exit/lease expiry. This is network confinement, not separate IAM identities: a compromised kernel, host administrator or sufficiently privileged container can defeat it. The host-network daemon remains trusted networking infrastructure and has no parameter permission of its own.

[Native storage evidence and decision](../.context/scratch/2026-11-17-zero-logs-release/credential-delivery-plan.md) selects the owner-accepted runtime-fetch fallback after the supported Bottlerocket mount interface could not cover the confirmed ECS checkpoint copy. Native qualification and rollout status are recorded separately in the handoff/launch records. The [November 18 fleet adoption](../.context/scratch/2026-11-17-zero-logs-release/fleet-adoption.md) replaces all four active secret-env hosts and passes bounded persistence checks; historical/provider copies are not erased.

The initializer writes protocol-private RAM directories and exits successfully before engines start. Xray rendering enforces `access/error/loglevel: none`, `dnsLog: false` and existing REALITY diagnostic `show: false` through the shared [logging policy](../runtime/ecs/xray-log-policy.jq). Only those diagnostic fields change; Parameter Store/imported bundle bytes, keys, peers and protocol settings are preserved. Verification compares the policy-rendered Xray bytes; AWG remains byte-preserving. This policy passed central native qualification and all four active regional rollouts on November 17; [release evidence](../.context/scratch/2026-11-17-zero-logs-release/README.md). DERP validates its certificate/key/IP and renders its private files plus public health metadata. Partial failure clears all configured protocol outputs. The initializer has no extra capabilities or writable root. Each engine mounts only its own directory read-only; AWG's writable network sockets/scratch remain separate. [Runtime permissions and lifetime](ecs.md#ram-configuration), [ECS execution roles](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html).

Read-only mounts prevent source-file changes through the engine mount; they do not hide usable keys from that engine or freeze its live protocol state. All containers share the host kernel. Root/Docker/ECS administrators remain trusted, and the former injected initializer environment persists in privileged Docker metadata and the ECS checkpoint on encrypted EBS, confirmed by bounded inspection. RAM storage reduces durable rendered files, not every disk trace or the impact of host compromise.

The host exposes TCP/UDP 443 and, when DERP is enabled, source-restricted UDP 3478. DERP TCP 443 is also restricted by address/source-aware host rules until Headscale admission exists. SSM administration has no public management port. IMDSv2 and bridge rules block protocol-container metadata access. Host attack paths also include the kernel, supply chain and AWS administration.

DERP identity creation is a separate explicit `npm run derp <target> provision` operation after the retained public IP exists. It never overwrites an existing identity or rotates Xray/AWG credentials. Certificates initially last 365 days; use public status/expiry and coordinate replacement with future map-pin propagation. Deployment/restart does not generate credentials. [Provisioning contract](derp-poc.md#identity-tls-and-secrets).

## What the persisted initializer bundles contain

XFS is a filesystem used on the host's encrypted EBS data disk; it is persistent storage, not the RAM-backed `tmpfs` configuration mount. The two initializer environment names are `GHOSTLINE_XRAY_BUNDLE` and `GHOSTLINE_AWG_BUNDLE`. The former carries a JSON envelope whose `files["server.json"]` is the encoded Xray server configuration, including the REALITY private key and allowed client identities. The latter carries the AWG server configuration, including its private key, peer public keys, preshared keys and obfuscation settings. These are static authentication/configuration material, not browsing-history bundles; they are still sensitive credentials.

The former delivery path is Parameter Store → ECS-injected initializer environment → private RAM rendering → engine read-only mount. Docker also saves the original environment as container-creation metadata on the XFS data disk. Unsetting shell variables does not edit that record. The RAM copy disappears with host RAM, while disk metadata can survive an ordinary stop/reboot and can be included in an EBS snapshot. Encryption at rest controls access; it does not stop an authorized service from creating a decrypted-use replica. The logging release suppresses traffic recording. The new direct-to-RAM delivery recipe avoids creating that copy on replacement hosts, while historical copies remain a separate boundary.

Those two-bundle observations predate DERP. A fresh November 17 Stockholm baseline scan confirms all three server bundles in both Docker metadata and the ECS checkpoint, including DERP's TLS private key/certificate and stable server key. The direct-to-RAM candidate passes cold, task-recovery and reboot scans with zero matches for nine sensitive protocol values plus three current temporary task credentials across four bounded persistent stores. Central native platform qualification and four-region fleet adoption pass; Cape Town remains parked. [Native evidence and limits](../.context/scratch/2026-11-17-zero-logs-release/native-credential-trial.md).

## Portable credential import

`npm run ecs <target> import <directory>` reads this protected directory:

```text
server/xray.json
server/awg.conf
clients/macos/xray.json
clients/macos/awg.conf
clients/ios/xray.json
clients/ios/awg.conf
```

The Xray server file is the envelope described above, not a bare engine config. Files must exclude group/other permissions. Keep the parent directory private. The importer validates native server/device identities and payload size before writing. It preserves original bytes, checks every existing value for conflicts, refuses overwrite, and verifies round-trip equality. All six payloads must fit the Standard-tier 4096-byte limit. [Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html).

Nonsecret deployment configuration contains no credential-source target alias. Recovery import uses an explicit directory; fresh-region initialization uses the reviewed [plan/execute command](development.md#explicit-regional-initialization) and temporary private staging. Existing envelope metadata is preserved without requiring an installer version or source instance. Deployment/restart must never generate replacement credentials as a side effect.

Client parameters may retain prior endpoint fields. `profiles` substitutes the currently allocated EIPs and writes private native profiles, VPN links and QR images under `.local/recovery/<target>-clients/`. Use those exports when addresses change. Device names are currently `macos` and `ios`; independent guest provisioning remains future work.

## Recovery and changes

For the current privacy-hardening work, Anthony explicitly defers credential rotation and device re-enrollment. Preserve existing identities and device setup; do not make rotation a routine remediation/deployment gate. Revisit only at an owner-selected major milestone that simplifies or justifies it. Changing the delivery mechanism can remove future Docker metadata copies without changing credential values.

Stop/start, park/rebuild and image deployment preserve identities. A parameter update alone does not refresh running containers; replace the task to reinitialize. Images, user data, CloudFormation templates, process argv, diagnostic output and git must never contain credential values. Authorized decryption stays inside verification/import processes; emit only hashes, equality results and selected metadata.

Anthony accepts the current recovery posture: preserve regional parameters and export client profiles on demand. Local exports and historical admin archives are optional convenience/recovery material; any retained copies must stay private. No manual LastPass backups, dedicated backup infrastructure or new emergency-reset tooling are required. Deployment-pipeline access to LastPass is prohibited. AWS operator credentials remain in the credential provider; recovery assumes access to an authorized AWS account and the project source/artifacts. Temporary ECR authentication is not a long-lived application secret.

Losing local profiles alone requires another `profiles` export, using the current deployed addresses. Losing a host is handled by the normal deployment recipe using the parameters. Parameter Store is the live credential source, not an independent backup; its [version history](https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-versions.html) helps with accidental value changes. If all usable copies of a server or device private key are lost, the same random identity cannot be reconstructed. An already-running task might continue temporarily, but replacement needs the missing server values. Anthony accepts downtime and device re-enrolment with new identities in that worst case; there is no requirement to preserve the old identities indefinitely.

Worst-case recovery is an explicit operator workflow: generate a complete new matching server/device configuration set, import it, deploy through the common regional recipe, export current profiles and reconfigure the devices. The explicit region initializer and validated import exist, but normal deployment does not generate missing identities and there is no dedicated reset command. Teardown alone is not credential rotation: `destroy` retains parameters and import refuses conflicting values, so any surviving obsolete values must be handled explicitly during an authorized identity reset. Infrastructure teardown is needed only when rebuilding the infrastructure itself. The separate `purge-region` operation deletes regional parameter identities irreversibly after destroy; using it requires an exact reviewed plan. It does not delete local copies or authorize an identity reset during routine deployment.

Follow-up hardening remains separate: broader dump/journal review, release vulnerability coverage and stronger host confinement. The accepted delivery refactor already disables initializer core dumps and avoids secret-environment creation inputs, including DERP; native qualification and four-region adoption pass. Preserve the documented shared task-role/network-isolation boundary rather than adding broader permissions during routine work.
