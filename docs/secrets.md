# Secret inventory and regional storage

Updated 2026-09-12. The six Stockholm server/device values are now imported into eu-north-1 Standard SecureStrings and verified byte-for-byte for the [ECS primary](ecs.md). The old Ubuntu Stockholm host is retired; local recovery copies and device identities remain unchanged. Cape Town normalization/import remains separate. VPN guest access uses protocol credentials, not SSH accounts or keys; the ECS host requires no administrator SSH key.

## Current secrets

Each active region has independent credentials for both protocols and two devices:

| Material | Purpose and current location | Destination |
| --- | --- | --- |
| Xray REALITY private key | Server identity; six-file `.local/recovery/<target>-runtime.json` bundle and host Xray config | Regional SecureString server bundle |
| Two VLESS client UUIDs | Bearer credentials for the Mac and iPhone; server bundle and client profiles | Same server bundle; corresponding restricted device exports |
| REALITY short ID | Shared access/configuration material, preserved with the key and client identities | Same bundle/profile, protected with credentials |
| AWG server private key | Server identity in `.local/recovery/<target>-awg/awg0.conf` and host AWG config | Regional SecureString server config |
| Two AWG client private keys | Independent Mac/iPhone identities in `macos.conf` and `ios.conf`; not needed on the server | Restricted regional SecureString device profiles |
| Two AWG preshared keys | One per device, shared with the server | Respective server and device configurations |
| AWG HeaderProtectionKey | Shared obfuscation key in the server and both device configs | Preserve inside those configurations |
| Operator SSH private key per legacy Ubuntu deployment | Administrator access from `.local/keys/<resourceName>` | Protected operator machine and owner-mediated LastPass recovery; not fetched by the host |
| Host SSH private keys | Host-specific SSH identity, generated on the EC2 filesystem | Remain host-local; stop retains them, a rebuild generates new keys and uses authenticated trust pinning |
| Legacy Amnezia application backups | Historical saved-server/admin material; may span active and retired regions | LastPass recovery archives, not runtime parameters |

VLESS UUIDs are credentials despite looking like ordinary identifiers. Public keys, endpoints, ports, DNS servers, MTU and protocol tuning numbers are not independently secrets. The complete configuration files remain confidential because they combine these settings with credentials. VPN links and QR images are derived credential copies, not additional identities; regenerate them locally from authorized profiles.

The runtime has no application passwords or separate TLS certificate private keys. ECR uses temporary IAM-based registry tokens; there is no long-lived registry password to store. REALITY uses the key described above. Operator AWS credentials remain with the AWS credential provider; any future host AWS access should use temporary instance-role credentials rather than copying operator credentials into Parameter Store. Amnezia's device-local encrypted preferences/Keychain state is not a server runtime dependency.

## Consistent regional hierarchy

Use identical parameter names in each deployment region, with independent values. Region belongs to the AWS client/ARN, not a duplicate path segment. The current one-exit-per-region model needs no regional target name in the path; multiple exits in one region would require an explicit additional namespace.

```text
/ghostline/prod/server/xray
/ghostline/prod/server/awg
/ghostline/prod/clients/macos/xray
/ghostline/prod/clients/macos/awg
/ghostline/prod/clients/ios/xray
/ghostline/prod/clients/ios/awg
```

Store complete validated bundles/configurations as `SecureString`. Preserve the six-file Xray bundle, including legacy companion identity files and clientsTable; do not reconstruct or rotate it merely to move storage. Device exports remain separate so a host role can fetch the server parameters without retrieving AWG client private keys. A privileged administrator can retrieve device exports for import/recovery. Use explicit parameter ARNs, not recursive access to the shared parent: [GetParametersByPath](https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParametersByPath.html) has recursive-access implications.

Measured current Xray bundles: Cape Town 2,746 bytes and Stockholm 2,150 bytes. AWG server configs are 773/772 bytes; device configs are 688/687 bytes. Stockholm Xray device JSON is 973 bytes each. These existing payloads fit the 4 KB Standard tier; enforce encoded byte-size limits before writes. [Parameter Store tiers and encryption](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html). ECS uses the regional default `alias/aws/ssm` key with exact SSM read permissions per protocol execution role; the host instance role cannot read parameters. SecureString alone does not define who can read a value. [Parameter Store setup](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-setting-up.html).

Cape Town Xray is a legacy export: no `<target>-runtime.json.clients/*.json` files currently exist. Its iPhone connection is `.local/recovery/ghostline-cape-town-iphone.vpn`, and its Mac connection lives in Amnezia. Preserve and validate both identities when normalizing client exports; do not infer a device mapping from arbitrary array order. Both client UUIDs are in the preserved server bundle. Duplicate `cape-town-owned-runtime.json` is a prior owned-runtime export, not a new set of keys.

Historical `.local/recovery/ghostline-poc.backup` and `ghostline-two-exits.backup` are recovery archives rather than regional runtime inputs; the latter contains admin material. Do not upload them wholesale under a server-readable prefix. Retired Frankfurt credentials remain historical and do not justify creating regional parameters there.

Client parameter values preserve the imported source configurations, including historical endpoint fields. `npm run ecs stockholm-ecs profiles` renders current live addresses into native files, links and QR images; import those exports instead of raw parameter values. Cutover did not rotate credentials or update parameter versions. The old Stockholm addresses are released.

## Migration/lifecycle boundaries

- ECS-aware explicit start/stop is implemented; neither action regenerates, uploads or relocates secrets. Stop retains EBS, credentials, ENI and both EIPs.
- Migrate existing regional identities without overwriting a conflicting parameter. Verify round-trip equality and runtime/client identity before considering removal of local copies.
- Keep recovery parameters outside disposable endpoint-stack deletion. `park` and `destroy` should preserve them; a deliberate credential-purge operation would be separate from releasing billable IPs.
- Parameter Store is the durable source, but the runtime still needs protected mounted configuration files while running. Fetch securely at installation/startup rather than per VPN connection. Values must not pass through command-line arguments, userdata, CloudFormation templates, images or logs.
- Preserve LastPass as Anthony-mediated independent recovery. No vault access or deletion of existing exports is included in this inventory.

See [runtime workflow](runtime.md) for current implementation and [architecture](architecture.md) for ownership. Automatic idle shutdown and a remote management UI remain proposals, not part of the selected start/stop work.
