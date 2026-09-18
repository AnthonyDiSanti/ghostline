# Regional secrets

Each region stores six independent `SecureString` values at identical paths. Region belongs to the AWS client/ARN, not the path. Parameter Store is the application source; LastPass is owner-mediated recovery. Endpoint removal never deletes parameters.

| Parameter suffix under `/ghostline/prod/` | Value |
| --- | --- |
| `server/xray` | JSON envelope containing base64 `files["server.json"]`; preserve any existing companion metadata |
| `server/awg` | Native AWG server configuration |
| `clients/macos/xray`, `clients/ios/xray` | Native Xray client JSON, with separate device UUIDs |
| `clients/macos/awg`, `clients/ios/awg` | Native AWG device configs with independent private keys |

REALITY server private keys, VLESS UUIDs, short IDs, AWG private/preshared keys and HeaderProtectionKey remain protected within these values. Public keys, addresses and tuning values are not independently secrets, but complete configs, links and QR images are credential copies. The engines do not need AWG client private keys.

## ECS delivery and threat boundary

Only `gateway-config` receives `GHOSTLINE_XRAY_BUNDLE` and `GHOSTLINE_AWG_BUNDLE`. The task execution role gives the ECS agent exact `ssm:GetParameters` access to the two regional server ARNs. Engines receive neither secret environment variables nor AWS task-role credentials. The host role has no parameter-read permission. Use the regional default SSM key; do not grant recursive parent-path access merely for convenience.

The initializer writes protocol-private RAM directories and exits successfully before engines start. It has no network, extra capabilities or writable root. Each engine mounts only its own directory read-only; AWG's writable network sockets/scratch remain separate. [Runtime permissions and lifetime](ecs.md#ram-configuration), [ECS execution roles](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html).

Read-only mounts prevent source-file changes through the engine mount; they do not hide usable keys from that engine or freeze its live protocol state. Both containers share the host kernel. Root/Docker/ECS administrators remain trusted, and original initializer environment values can persist in privileged container metadata on encrypted EBS. RAM storage reduces durable rendered files, not every disk trace or the impact of host compromise.

The host exposes only TCP/UDP 443. SSM administration requires AWS authority and no public management port. IMDSv2 and bridge rules block protocol-container metadata access. Host attack paths also include the kernel, supply chain and AWS administration; container compromise is not the only possible route.

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

Nonsecret deployment configuration contains no credential-source target alias. Recovery and region initialization use an explicit directory. Existing envelope metadata is preserved without requiring an installer version or source instance. Deployment/restart must never generate replacement credentials as a side effect.

Client parameters may retain prior endpoint fields. `profiles` substitutes the currently allocated EIPs and writes private native profiles, VPN links and QR images under `.local/recovery/<target>-clients/`. Use those exports when addresses change. Device names are currently `macos` and `ios`; independent guest provisioning remains future work.

## Recovery and changes

Stop/start, park/rebuild and image deployment preserve identities. A parameter update alone does not refresh running containers; replace the task to reinitialize. Images, user data, CloudFormation templates, process argv, diagnostic output and git must never contain credential values. Authorized decryption stays inside verification/import processes; emit only hashes, equality results and selected metadata.

Keep protected local recovery material until owner-mediated LastPass closeout. Anthony deferred vault updates until architecture work settles; do not repeatedly request interim updates. AWS operator credentials remain in the credential provider, and temporary ECR authentication is not a long-lived application secret. Existing admin archives stay private recovery material, not server-readable parameters.

Follow-up hardening remains separate: explicit core-dump controls, release vulnerability coverage, stronger host confinement and a design that avoids environment-metadata persistence. None justifies adding an engine task role or weakening current isolation during routine work.
