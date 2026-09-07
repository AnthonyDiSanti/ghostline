# Handoff

## Current state

- Cape Town is the only live region: profile `personal`, account `757999402784`, stack `GhostlinePoc` / `af-south-1`. Current `runtime.awgEnabled=true`; migration stages are removed. [Launch evidence](../docs/launch-cape-town.md), [runtime commands/checkpoint](../docs/runtime.md).
- Xray now serves from managed host `i-017247cce7d2bf84f`, ENI `eni-08e0645155028a484`, encrypted 20 GiB disk `vol-0da8507796f328afc`; same Ubuntu 24.04 AMI and `t3.small`.
- Original Xray EIP `16.28.130.178` / `eipalloc-09b530775698d23bb` is retained and mapped to secondary `10.77.0.31`. AWG/admin EIP `15.240.94.162` / `eipalloc-0d22c628c5fde384e` maps to primary `10.77.0.124`. One ENI, two addresses. Xray publishes TCP 443 and AWG publishes UDP 443 on their respective private IPs.
- Original host `i-0abac95ff3acf0d6a` is terminated and disk `vol-064009c61166ba8bb` is absent. Anthony committed the checkpoint and authorized continuation. One permanent host remains.
- Complete Xray export is `.local/recovery/cape-town-runtime.json`, mode 600/parent 700. All six files and both client identities preserved. Runtime Xray 26.7.28, local tag `ghostline-xray:76b2a96fa52395fb`; server config matches original byte-for-byte.
- Managed host runs Docker 29.8.0 / Compose 5.5.1. Cloud-init already persists the secondary IPv4; no custom network overlay remains. Actual Xray kernel SNAT and external exit match the original EIP.
- Repeat install preserved container ID and start timestamp. Host reboot passed automatic container/address restoration, config equality and real egress. Native unchanged Mac profile then passed original exit-IP and Wikipedia HTTPS 200 checks. Anthony confirmed the practical macOS/iOS migration checkpoint passed on 2026-09-07; individual subtests were not enumerated.
- AWG is installed with independent peers under `.local/recovery/cape-town-awg/`. Mac AmneziaVPN 5.0.1.5 imported `macos.vpn` and passed measured exit `15.240.94.162` / Wikipedia HTTPS 200. Shared-host reboot restored both runtimes, configs and distinct EIPs; post-reboot Mac Xray exit/HTTPS passed. Anthony subsequently confirmed both final tests passed: iPhone AWG import/practical trial and manual Xray switching, plus Mac post-reboot AWG reconnect. Do not repeat these checkpoints or infer unreported DNS/IPv6 subtests/current client connection state.
- Billing remains Project=ghostline, Environment=prod; managed compute/network System=shared, Xray EIP System=xray, second EIP System=amneziawg. Native billing Region remains the cross-region dimension.
- Frankfurt was completely retired in `79d3314`; its catalog entry is only a recipe. Do not redeploy it. Historical local backups contain obsolete Frankfurt entries.

## Next steps

1. The authorized runtime/AWG work unit is complete and ready for Anthony's commit; no further deployment or client changes are needed for this pass.
2. Anthony saves recovery material in LastPass if not already done. Required current artifacts: `.local/keys/ghostline-poc-cape-town`, `.local/recovery/cape-town-runtime.json` (or the byte-equivalent `cape-town-owned-runtime.json`), and all three `.conf` files in `.local/recovery/cape-town-awg/`. VPN links/QRs can be regenerated from those peer files. Vault saves remain unconfirmed and are owner-mediated; this does not block the code commit.
3. Retain evidence limits for future trials: Xray showed Cloudflare resolvers, but AWG-specific resolver/routes were not separately observed. No usable direct IPv6 baseline was available, so IPv6 leak prevention is not certified. These are follow-up observations, not expanded acceptance gates.

## Scope and verification

- Authorized boundary: Ghostline-owned containers plus a minimal npm/SSH install path; upstream protocol implementations and container distributions retained. Ubuntu host stays on the same AMI. Manual client switching only. No automatic failover, rollback framework, ECR/ECS stack, Parameter Store backend or instance IAM role.
- Implementation verification: Node 24 full gate passed typecheck, both offline synth targets and 66 tests. Added a real Mac extended-attribute archive regression test. Container recipes are unchanged; prior disposable image tests remain valid. Git-visible imported-credential scan, 89 local documentation links and `git diff --check` passed.
- Cloud: original host retirement and UDP ingress deployment each followed separate fresh diffs; final live diff is clean. Repeat installs preserved both container IDs/start timestamps. Both runtimes recovered after reboot with correct config, bindings, kernel SNAT and actual exit EIPs.
- Recovery: owned-runtime export `.local/recovery/cape-town-owned-runtime.json` matches all six original file values. Export exposed AppleDouble sidecars from Mac tar; disable metadata in the archive helper and remove only verified sidecars from the server. Real configs remain untouched.
- npm uses local Node 24.20.0 and NPM_CONFIG_CACHE=/tmp/ghostline-npm-cache. Follow `AGENTS.local.md`: omit only unsupported npm_config_http_proxy/NPM_CONFIG_HTTP_PROXY, preserve supported proxies/warnings. AWS/SSH/Docker need sandbox escalation here.
- SSH trust for staging address was pinned from authenticated EC2 console keys. Use `15.240.94.162` for managed-host administration; do not blindly replace the old Xray-address known-host entry. Disconnect the Mac tunnel before SSH; never widen its operator /32.
- Started clean at `cee7d4c`; this continuation is uncommitted and the index is untouched. Original retirement and live AWG install are complete. Preserve the SSH KeyPair historical tag; retagging would replace it and could cascade to the working host.

- Commit prep: record Anthony’s final device passes, close the runtime task and update current product/agent status. Documentation-only edits this turn reuse the passing 66-test implementation gate and clean live diff. Fresh credential scan, 90 local documentation links, Python syntax, manifest/lockfile consistency and `git diff --check` passed. No cloud/client changes or generated artifact refreshes; index remains untouched.
