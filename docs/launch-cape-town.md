# Cape Town launch evidence

Observed 2026-09-07. Anthony authorized a parallel Cape Town trial, preserving Frankfurt, to test regional privacy/performance and repeatability. See [development](development.md) for reusable commands and [Frankfurt launch](launch.md) for the original endpoint.

## AWS deployment

| Item | Observed value |
| --- | --- |
| Target / account | `cape-town`; profile `personal`, account `757999402784` |
| Region / stack | `af-south-1` / `GhostlinePoc` |
| Host | `i-0abac95ff3acf0d6a`, `t3.small`, `af-south-1a` |
| OS / image | Ubuntu 24.04.4 LTS x86_64; `ami-01effbf5effae5715`, Canonical server build `20260904` |
| Storage | `vol-064009c61166ba8bb`, encrypted 20 GiB gp3; deleted with host |
| Endpoint | `16.28.130.178`, allocation `eipalloc-09b530775698d23bb`; retained independently |
| Access | TCP 443 public; SSH 22 from operator `5.195.76.221/32` |
| Runtime AWS access | No instance profile or runtime IAM role |
| Billing | EC2/EBS/EIP verified: `Project=ghostline`, `Environment=prod`, `System=xray` |

Anthony enabled the opt-in region; monitoring observed ENABLING, then ENABLED. The reusable preflight verified account, regional image ownership/metadata, AZ and instance offering. Both image IDs correspond to the same Canonical Ubuntu build; no Frankfurt image change was needed. The Frankfurt CDK diff reported no differences after the refactor. The Cape Town diff contained only the expected new endpoint/network resources; normal interactive CDK deployment succeeded.

Retrieved host public keys from authenticated EC2 console output and pinned them in `.local/deployments/cape-town/known_hosts`. Strict SSH succeeded; cloud-init completed and passwordless sudo works for `ubuntu`. No first-connection trust bypass was needed.

## Runtime and client trial

AmneziaVPN 5.0.1.5 completed installation successfully on the first Manual → XRay attempt. The saved server is named `Ghostline Cape Town`; Frankfurt remains as `Server 1`. Disconnect the Mac tunnel before server administration. Add a separate self-hosted server at the Cape Town EIP using `ubuntu` and the dedicated key; select **Manual → XRay → TCP 443**. Automatic selects AmneziaWG and is not the reference setup. Generate fresh runtime identity; do not copy Frankfurt's server secrets or overwrite its profile.

IaC repeatability covers cloud resources and launch checks. Amnezia remains the manual runtime installer/manager; deployment alone does not recreate its containers or client credentials. The final client browsing/privacy/performance trial is separate from cloud success.

Observed runtime: XRay `26.7.28`, commit `5ca6f4b`; VLESS/TCP 443 with REALITY and default `www.googletagmanager.com:443`. Only `amnezia-xray` is running, restart `always`, Docker log driver `none`, XRay log level `error`. Docker publishes TCP/UDP 443, while the AWS security group accepts only the required TCP listener. Local image ID: `sha256:13128d130120b0fef87b7fe475ac825e011804ef8534845ba12a37cb71ded1b8`.

Versions/defaults match Frankfurt, but the locally built image IDs differ. This demonstrates repetition of the accepted installer workflow, not deterministic container builds or identical secret/runtime state.

Native Mac checks passed: disconnected exit `5.195.76.221`; connected Cape Town exit `16.28.130.178` with Wikipedia HTTPS 200; switch back to Frankfurt produced `3.69.128.6` and HTTPS 200; switch again to Cape Town restored `16.28.130.178`. Mac is left connected to Cape Town with split tunneling disabled. A single HTTPS fetch is not a throughput or video-performance benchmark. Private Relay and other previously selected client settings were not changed. DNS/IPv6 and sleep/network-transition evidence is not expanded by these checks.

## Local material

- Dedicated RSA4096 PEM admin key: `.local/keys/ghostline-poc-cape-town`, mode 600; its `.pub` is the only key material supplied to CDK. This is separate from Frankfurt's `ghostline-poc` key.
- For another deployment, generate the RSA key with `ssh-keygen -t rsa -b 4096 -m PEM -f <private-key-path>`; the reference key has no passphrase for the accepted installer workflow. Keep it out of git and save it in LastPass through Anthony.
- Deployment outputs, console evidence and known hosts: ignored `.local/deployments/cape-town/`. The original Frankfurt `.local/outputs.json` was not overwritten.
- VPN-only iPhone export: `.local/recovery/ghostline-cape-town-iphone.vpn`, 1,270 bytes, mode 600. Generated through the Cape Town server's Connection export; the UI limited the requested user label to `Anthony iPhone Cape `.
- Updated application recovery export containing both saved servers: `.local/recovery/ghostline-two-exits.backup`, 15,131 bytes, mode 600. This is a new file; original Frankfurt exports remain intact. It contains admin material and is not the device-sharing profile.
- LastPass saves require owner confirmation; the agent does not access the vault. Suggested items: `Ghostline Cape Town — SSH admin key`, `Ghostline Cape Town — iPhone connection`, and `Ghostline — Two-exit Amnezia recovery`.

## Trial result and remaining follow-ups

- Completed: installation, local exports, native Mac exit/HTTPS and switching between both servers. Both regional CDK diffs reported no differences; full offline tests passed (42 assertions).
- PASS — Anthony reported both Cape Town macOS and iOS tests passed on 2026-09-07. This is owner-reported practical trial evidence; individual video/concurrency/privacy subtests were not separately enumerated.
- Anthony: confirm LastPass saves of the new key/profile/backup. Preserve the Frankfurt profiles. DNS/IPv6 and sleep/network-transition observations remain limited to the recorded evidence.
- Preserve Frankfurt throughout the comparison. No teardown, retained-EIP release or automatic lifecycle controller is authorized by this launch.
