# Cape Town launch evidence

Observed 2026-09-07. Anthony authorized a parallel Cape Town trial, preserving Frankfurt, to test regional privacy/performance and repeatability. See [development](development.md) for reusable commands and [Frankfurt launch](launch.md) for the original endpoint.

## Owned runtime — current state

Observed 2026-09-07 after Anthony authorized the implementation in [runtime](runtime.md). The stack uses `runtime.awgEnabled=true`; migration stages are retired.

| Item | Current value |
| --- | --- |
| Serving host | `i-017247cce7d2bf84f`, same Ubuntu AMI / `t3.small` |
| Root volume | `vol-0da8507796f328afc`, encrypted 20 GiB gp3 |
| Managed ENI | `eni-08e0645155028a484` |
| Xray ingress/egress | Existing `16.28.130.178`, same allocation `eipalloc-09b530775698d23bb`, mapped to `10.77.0.31` |
| AWG ingress/egress and admin address | `15.240.94.162`, allocation `eipalloc-0d22c628c5fde384e`, mapped to primary `10.77.0.124` |
| Reference retirement | `i-0abac95ff3acf0d6a` terminated; `vol-064009c61166ba8bb` absent |
| Runtime | Ghostline-owned Xray 26.7.28 and userspace AWG 3.1; Docker 29.8.0; Compose 5.5.1 |
| Local image tags | `ghostline-xray:76b2a96fa52395fb`, `ghostline-awg:b36a66191dd0a8bc` |
| Runtime access | TCP 443 on Xray private address; UDP 443 on AWG private address; SSH from `5.195.76.221/32` |

Preparation added only the managed host, ENI, security group, second EIP and its association. Every original resource remained unchanged. Cutover replaced only the existing Xray EIP association and changed the active instance output; the EIP allocation itself was preserved. Both reviewed CDK deployments completed successfully.

Recovered all six Xray configuration files into `.local/recovery/cape-town-runtime.json` (mode 600; parent 700), preserving both existing clients. The replacement `server.json` is byte-for-byte identical. No new Xray identity or client profile was generated. New-host SSH trust was pinned from authenticated EC2 console output using the staging address; the dedicated admin key is unchanged.

Verified running state, the address-specific TCP listener, actual kernel SNAT from `172.28.10.0/24` to `10.77.0.31`, and container egress `16.28.130.178`. Repeating installation kept container `4abfa1f1ac1afe28c82b05c8cf2a86340eefef3ecb6c34114fb2c0bc9e50d2cf` and its start timestamp unchanged. Reboot at 02:58 UTC restored the same container automatically; both addresses and source NAT persisted, configuration equality and original-IP egress passed again.

Ubuntu's cloud-init already configured the secondary private IP in netplan. A redundant overlay introduced during bootstrap development was removed before cutover; no custom address-persistence service remains. Host Docker packages were installed from the official signed Ubuntu repository; the host/package layer is not claimed to be fully immutable.

The unchanged native Mac profile connected after reboot: exit `16.28.130.178`, Wikipedia HTTPS 200. **PASS — Anthony validated the unchanged macOS/iOS profiles after migration on 2026-09-07.** This is practical owner-reported validation; individual DNS/IPv6/video subtests were not separately enumerated. He committed this checkpoint in `cee7d4c` and then authorized continuation through AWG validation.

### AWG continuation

Retirement diff removed only the original EC2 instance and its security group. Verified the instance terminated and its root disk disappeared; the managed host, ENI, SSH key and both EIP allocations stayed intact. Removed temporary migration stages afterward. A separate reviewed deployment added only UDP 443 ingress. Final live CDK diff is clean.

Installed AWG on the same host with independent Mac/iPhone credentials, mode 600 under `.local/recovery/cape-town-awg/`. Server startup, UDP binding, actual kernel SNAT and container egress `15.240.94.162` passed. Existing Xray config and `16.28.130.178` egress still passed. Repeat installation preserved both container IDs and start times. Shared-host reboot restored both runtimes, their private bindings, config equality and actual distinct EIPs.

Mac AmneziaVPN 5.0.1.5 accepted `macos.vpn`, identified AmneziaWG version 3.1, and passed real exit `15.240.94.162` plus Wikipedia HTTPS 200. Profile name is `Ghostline Cape Town AWG`; original Xray profile is preserved. Post-reboot Mac Xray exit/HTTPS also passed. **PASS — Anthony confirmed both remaining tests passed on 2026-09-07: the iPhone AWG import/practical trial with manual switching back to Xray, and the Mac post-reboot AWG selection/reconnect.** These are owner-reported results; no additional exit-IP readings or individual DNS/IPv6 subtest results were supplied. Qt automation required owner assistance to apply the Mac profile row selection; this is a client automation limitation, not an outstanding connectivity failure.

Recovery export from the owned Xray container passed with all six original file values byte-for-byte equal. The check caught macOS tar AppleDouble sidecars; installation archives now disable them. Removed only files with verified AppleDouble magic, preserving actual configuration. A real extended-attribute regression test covers this behavior.

Node 24 final gate passed typecheck, both offline synth targets and 66 tests. Prior disposable-image checks remain valid because container recipes did not change. The current network has no successful direct IPv6 baseline, so IPv6 leak prevention cannot be claimed from this trial. Record device DNS/routes separately from generated profile intent.

## Reference AWS deployment (before migration)

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

## Reference runtime and client trial

AmneziaVPN 5.0.1.5 completed installation successfully on the first Manual → XRay attempt. The saved server is named `Ghostline Cape Town`; Frankfurt remains as `Server 1`. Disconnect the Mac tunnel before server administration. Add a separate self-hosted server at the Cape Town EIP using `ubuntu` and the dedicated key; select **Manual → XRay → TCP 443**. Automatic selects AmneziaWG and is not the reference setup. Generate fresh runtime identity; do not copy Frankfurt's server secrets or overwrite its profile.

IaC repeatability covers cloud resources and launch checks. Amnezia remains the manual runtime installer/manager; deployment alone does not recreate its containers or client credentials. The final client browsing/privacy/performance trial is separate from cloud success.

Observed runtime: XRay `26.7.28`, commit `5ca6f4b`; VLESS/TCP 443 with REALITY and default `www.googletagmanager.com:443`. Only `amnezia-xray` is running, restart `always`, Docker log driver `none`, XRay log level `error`. Docker publishes TCP/UDP 443, while the AWS security group accepts only the required TCP listener. Local image ID: `sha256:13128d130120b0fef87b7fe475ac825e011804ef8534845ba12a37cb71ded1b8`.

Versions/defaults match Frankfurt, but the locally built image IDs differ. This demonstrates repetition of the accepted installer workflow, not deterministic container builds or identical secret/runtime state.

Native Mac checks passed: disconnected exit `5.195.76.221`; connected Cape Town exit `16.28.130.178` with Wikipedia HTTPS 200; switch back to Frankfurt produced `3.69.128.6` and HTTPS 200; switch again to Cape Town restored `16.28.130.178`. Mac is left connected to Cape Town with split tunneling disabled. A single HTTPS fetch is not a throughput or video-performance benchmark. Private Relay and other previously selected client settings were not changed. DNS/IPv6 and sleep/network-transition evidence is not expanded by these checks.

## Reference local material

- Dedicated RSA4096 PEM admin key: `.local/keys/ghostline-poc-cape-town`, mode 600; its `.pub` is the only key material supplied to CDK. This is separate from Frankfurt's `ghostline-poc` key.
- For another deployment, generate the RSA key with `ssh-keygen -t rsa -b 4096 -m PEM -f <private-key-path>`; the reference key has no passphrase for the accepted installer workflow. Keep it out of git and save it in LastPass through Anthony.
- Deployment outputs, console evidence and known hosts: ignored `.local/deployments/cape-town/`. The original Frankfurt `.local/outputs.json` was not overwritten.
- VPN-only iPhone export: `.local/recovery/ghostline-cape-town-iphone.vpn`, 1,270 bytes, mode 600. Generated through the Cape Town server's Connection export; the UI limited the requested user label to `Anthony iPhone Cape `.
- Updated application recovery export containing both saved servers: `.local/recovery/ghostline-two-exits.backup`, 15,131 bytes, mode 600. This is a new file; original Frankfurt exports remain intact. It contains admin material and is not the device-sharing profile.
- LastPass saves require owner confirmation; the agent does not access the vault. Suggested items: `Ghostline Cape Town — SSH admin key`, `Ghostline Cape Town — iPhone connection`, and `Ghostline — Two-exit Amnezia recovery`.

## Reference trial result and remaining follow-ups

- Completed: installation, local exports, native Mac exit/HTTPS and switching between both servers. Both regional CDK diffs reported no differences; full offline tests passed (42 assertions).
- PASS — Anthony reported both Cape Town macOS and iOS tests passed on 2026-09-07. This is owner-reported practical trial evidence; individual video/concurrency/privacy subtests were not separately enumerated.
- Anthony: confirm LastPass saves of the Cape Town key/profile/backup. DNS/IPv6 and sleep/network-transition observations remain limited to the recorded evidence.
- Subsequent lifecycle decision: Anthony requested Frankfurt teardown and retained-EIP release after the Cape Town passes; see [Frankfurt retirement](launch.md#retirement). Local backups remain historical recovery material. Cape Town is unaffected.
