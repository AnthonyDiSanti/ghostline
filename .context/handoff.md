# Handoff

## Current state

- Cape Town is the only live region: profile `personal`, account `757999402784`, stack `GhostlinePoc` / `af-south-1`. Current `runtime.stage=cutover`, `awgEnabled=false`. [Launch evidence](../docs/launch-cape-town.md), [runtime commands/checkpoint](../docs/runtime.md).
- Xray now serves from managed host `i-017247cce7d2bf84f`, ENI `eni-08e0645155028a484`, encrypted 20 GiB disk `vol-0da8507796f328afc`; same Ubuntu 24.04 AMI and `t3.small`.
- Original Xray EIP `16.28.130.178` / `eipalloc-09b530775698d23bb` is retained and mapped to secondary `10.77.0.31`. Staging/future-AWG EIP `15.240.94.162` / `eipalloc-0d22c628c5fde384e` maps to primary `10.77.0.124`. One ENI, two addresses. Xray publishes only TCP 443; AWG is not installed and UDP 443 is not open.
- Original host `i-0abac95ff3acf0d6a` and disk `vol-064009c61166ba8bb` remain running/intact without a public IP. Anthony validated unchanged macOS/iOS profiles and requested a pause for his commit. Retire this host only after he commits and resumes, before installing AWG; final topology is one host, not two.
- Complete Xray export is `.local/recovery/cape-town-runtime.json`, mode 600/parent 700. All six files and both client identities preserved. Runtime Xray 26.7.28, local tag `ghostline-xray:76b2a96fa52395fb`; server config matches original byte-for-byte.
- Managed host runs Docker 29.8.0 / Compose 5.5.1. Cloud-init already persists the secondary IPv4; no custom network overlay remains. Actual Xray kernel SNAT and external exit match the original EIP.
- Repeat install preserved container ID and start timestamp. Host reboot passed automatic container/address restoration, config equality and real egress. Native unchanged Mac profile then passed original exit-IP and Wikipedia HTTPS 200 checks. Mac is left connected. Anthony confirmed the practical macOS/iOS migration checkpoint passed on 2026-09-07; individual subtests were not enumerated.
- AWG image, state generation and isolated Compose project are implemented and tested locally with disposable credentials. Actual generated 3.1 peer handshake passed locally. No real AWG peer credentials/profile imports or live client trials yet.
- Billing remains Project=ghostline, Environment=prod; managed compute/network System=shared, Xray EIP System=xray, second EIP System=amneziawg. Native billing Region remains the cross-region dimension.
- Frankfurt was completely retired in `79d3314`; its catalog entry is only a recipe. Do not redeploy it. Historical local backups contain obsolete Frankfurt entries.

## Next steps

1. Wait for Anthony to commit and resume. The macOS/iOS migration checkpoint is complete; do not ask him to repeat it or advance the deployment during commit prep.
2. After his commit/resume, disconnect Mac VPN for SSH administration, set Cape Town stage to `managed` with AWG disabled, review a fresh diff and retire only the original host/security group/disk. Verify one EC2 host remains and both EIPs stay attached.
3. Remove temporary migration-stage scaffolding without changing managed-resource or retained-EIP logical IDs; preserve Frankfurt's undeployed reference recipe.
4. Set AWG enabled and deploy reviewed UDP ingress. Generate independent real AWG peers, install on the same host, and import off-the-shelf client profiles (verify actual Apple format/version support). Test both protocols, distinct exit IPs, DNS/IPv6 and reboot persistence.
5. Anthony saves recovery material in LastPass. No vault operation is authorized for the agent; the existing SSH key and device/application exports remain protected under `.local/`. The new bundle adds portable runtime state.

## Scope and verification

- Authorized boundary: Ghostline-owned containers plus a minimal npm/SSH install path; upstream protocol implementations and container distributions retained. Ubuntu host stays on the same AMI. Manual client switching only. No automatic failover, rollback framework, ECR/ECS stack, Parameter Store backend or instance IAM role.
- Implementation verification: Node 24 full gate passed typecheck, offline synth and 63 tests. Both disposable-container checks passed, including an AWG peer handshake; post-cutover CDK diff was clean. Imported-credential scanning and 83 local documentation links passed. Commit prep changed documentation only: 85 local links, shell/Python syntax, preserved-license comparison, imported-credential scan and `git diff --check` passed. Reuse the passing implementation npm/container gates; no image rebuild, live deployment or client change was performed.
- Cloud: preparation and EIP-only cutover completed after separate fresh diffs; reference EIP allocation identity is unchanged. Anthony subsequently reported the practical device checkpoint passed.
- npm uses local Node 24.20.0 and NPM_CONFIG_CACHE=/tmp/ghostline-npm-cache. Follow `AGENTS.local.md`: omit only unsupported npm_config_http_proxy/NPM_CONFIG_HTTP_PROXY, preserve supported proxies/warnings. AWS/SSH/Docker need sandbox escalation here.
- SSH trust for staging address was pinned from authenticated EC2 console keys. Use `15.240.94.162` for managed-host administration; do not blindly replace the old Xray-address known-host entry. Disconnect the Mac tunnel before SSH; never widen its operator /32.
- Work is uncommitted and the index is untouched. Pre-existing dirty research docs are included in the full work unit. Checkpoint validation and the post-commit continuation boundary are recorded; retirement and live AWG remain outstanding.
