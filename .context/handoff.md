# Handoff

## Current state

- Infrastructure implemented and deployed 2026-09-07. Read `docs/launch.md` for authoritative observed resources, launch actions and remaining client evidence.
- `GhostlinePoc` in account `757999402784`, Frankfurt; one Ubuntu x86_64 `t3.small`, encrypted 20 GiB root disk, retained EIP `3.69.128.6`. SSH verified using host keys from authenticated EC2 console output. No bootstrap infrastructure or runtime IAM role.
- AmneziaVPN 5.0.1.5 installed on macOS. XRay 26.7.28 is installed on TCP 443; only `amnezia-xray` remains. Mac native exit/HTTPS and deliberate reconnect checks pass. Anthony confirmed practical macOS and iOS tests passed on 2026-09-07; video remains unconfirmed. A destination age-verification prompt is an unresolved privacy issue; see `docs/region-selection.md`. Complete features first, then debug; keep Private Relay enabled and Proton disconnected.
- Global cost dimensions mirror personal-assistant. Live EC2/EBS/EIP tags verified; cost-allocation keys already Active. Reference repository remains unchanged.
- Local private key and deployment artifacts are ignored under `.local/`. LastPass computer-use access was denied; Anthony explicitly offered to intermediate all vault activity. Prepare artifacts and give paths/item names. Never print credentials or commit profiles.
- Initial docs committed previously as `17d2a40`. Implementation/docs changes are uncommitted. No index changes made.

## Next steps

1. Anthony: confirm LastPass saves of the SSH key, `.local/recovery/ghostline-poc.backup` and `.local/recovery/ghostline-iphone.vpn`. The iOS test has now passed.
2. Confirm the affected browser's visible exit country and choose a replacement region; the age-check flow requires signup, which Anthony rejects. EFF/ORG and official EU/Swiss/Canadian sources are captured in `docs/region-selection.md`. Canada Central is a provisional trial candidate, not yet selected or deployed; neither its browsing behavior nor Dubai performance is verified. Then confirm video, concurrent use and sleep/network reconnects. Validate DNS/IPv6 on a capable network; present IPv6-only checks fail both with and without the tunnel.
3. Debug observed failures from the complete setup. Mac is left connected, full routing and Soft KillSwitch enabled. Disconnect before SSH administration (SSH times out with the tunnel active).

## Verification and local environment

- PASS: clean `npm ci`, then Node 24.20.0 full `npm test`: typecheck, fresh offline synthesis, 25 Vitest assertions. Synthetic test key is public-only with its private half discarded. No AWS calls in tests.
- PASS: final CDK diff reports no differences. Reviewed all 38 tracked/candidate files; 57 local documentation links resolve, whitespace/private-key checks pass, and secret exports are ignored. Index remains unchanged.
- PASS: fresh CDK diff before successful deployment; encrypted EBS and resource tags verified through AWS; strict SSH and cloud-init readiness verified.
- Use local Node 24 at `.local/node-v24.20.0-darwin-arm64/bin` for this session; system Node is 26. Set `NPM_CONFIG_CACHE=/tmp/ghostline-npm-cache` because the normal npm cache is not writable in the sandbox. Do not copy this machine override into general command requirements.
- AWS/SSH network calls require sandbox escalation in this environment. Normal CDK interactive approval succeeded. Auto-review rejected `--require-approval never`; do not use that flag.
- CDK warns about pinned AMI/AZ portability. These are intentional one-region inputs; revalidate availability before a future replacement.
