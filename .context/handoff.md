# Handoff

## Current state

- Both minimal endpoints deployed in account `757999402784`, profile `personal`, on 2026-09-07. [Frankfurt evidence](../docs/launch.md), [Cape Town evidence](../docs/launch-cape-town.md).
- Frankfurt remains intact: `GhostlinePoc` / `eu-central-1`, host `i-0463a0a244a20c540`, EIP `3.69.128.6`. Cape Town: `GhostlinePoc` / `af-south-1`, host `i-0abac95ff3acf0d6a`, EIP `16.28.130.178`. One Ubuntu x86_64 t3.small and encrypted 20 GiB gp3 per target, retained EIPs, no bootstrap/runtime IAM roles.
- AmneziaVPN 5.0.1.5 installed XRay 26.7.28 on both. Cape Town Manual → XRay succeeded without installer retries; matching defaults do not imply deterministic container builds. Runtime installation is still manual, independent of IaC.
- Mac is left connected to `Ghostline Cape Town`; Frankfurt remains `Server 1`. Native exit/HTTPS and switching between both pass. Anthony confirmed Cape Town macOS and iOS practical tests passed as well. Individual subtests were not separately enumerated. Keep Private Relay enabled and Proton disconnected.
- Shared billing dimensions remain Project=ghostline, Environment=prod, System=xray/shared. EC2/EBS/EIP tags verified in Cape Town; use native billing Region grouping for exits. Reference repository unchanged.
- New ignored local secrets: `.local/keys/ghostline-poc-cape-town`, `.local/recovery/ghostline-cape-town-iphone.vpn`, `.local/recovery/ghostline-two-exits.backup`. Modes 600, recovery directory 700. Original Frankfurt exports preserved. Anthony intermediates all LastPass activity; vault saves remain unconfirmed.
- Initial implementation committed as `db4e2fc`; named-deployment/Cape Town work and the supplied research archive are uncommitted. Index untouched.

## Next steps

1. Cape Town macOS/iOS practical trial passed per Anthony. Confirm LastPass saves of the new artifacts and earlier Frankfurt material; keep detailed subtest claims limited to observed/reported evidence.
2. Debug actual failures from the complete setup. Disconnect the Mac tunnel before SSH/Amnezia server administration. Do not broaden the SSH /32 to work around client routing.
3. Keep selectable/on-demand lifecycle automation deferred. Named target commands and independent stacks are implemented; stop/delete/EIP retention and runtime recovery remain explicit lifecycle decisions. Do not tear down Frankfurt.

## Verification and environment

- PASS: Node 24.20.0 `npm test`: typecheck, fresh offline synthesis for both targets, 42 Vitest assertions. No AWS calls in tests. Missing/unknown targets fail; regional artifacts and stack/key identities are isolated.
- Commit-prep review: all 28 changed/new files reviewed; current docs reflect both live exits and owner-reported device passes. Full local gate rerun passed, 74 non-archive local documentation links resolved, `git diff --check` passed, and no private-key blocks were found in changed files. Index preserved; no live deployment repeated.
- PASS: live regional preflights, Frankfurt no-change diff, reviewed Cape Town creation diff/deploy and Cape Town no-change diff. Strict SSH pinned via authenticated EC2 console output; cloud-init/sudo and encrypted storage/tags verified.
- PASS: Cape Town native IP/HTTPS, switch to Frankfurt IP/HTTPS, return to Cape Town IP. These do not establish privacy-policy, video or native IPv6 acceptance.
- Named commands from infra: `npm run deploy cape-town`; the same positional target applies to `preflight`, `synth` and `diff`. Use `frankfurt` for the original. See `docs/development.md` for key/environment inputs. Outputs live under `.local/deployments/<target>/`.
- Local Node 24: `.local/node-v24.20.0-darwin-arm64/bin`; system Node is 26. Set NPM_CONFIG_CACHE=/tmp/ghostline-npm-cache in this sandbox.
- Managed npm environment: follow ignored `AGENTS.local.md` and omit only `npm_config_http_proxy` / `NPM_CONFIG_HTTP_PROXY` when invoking npm. These unsupported duplicates originate in the Codex command environment; preserve supported proxies and warnings. Full 42-test verification passed without the npm warning. Upstream injection remains outside Ghostline.
- AWS/SSH require sandbox escalation here. Normal CDK interactive approval works; do not bypass it. Auto-review initially rejected enabling a region; Anthony enabled Cape Town, monitoring confirmed ENABLING → ENABLED. No account/IAM workaround used.
- AMI/AZ portability warnings are expected for explicit regional pins; preflight verifies their current availability. Qt AX/radio and desktop export observations are in `.context/knowledge/amnezia.md`.
- CLI clarification: npm forwards positional targets without `--`; examples/help now use `npm run deploy cape-town`. Verified forwarding with `npm run test:vitest test/deployments.test.ts` (11 tests passed).
