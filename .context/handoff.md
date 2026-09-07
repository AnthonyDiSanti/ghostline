# Handoff

## Current state

- Cape Town is the only live Ghostline exit: account `757999402784`, profile `personal`, stack `GhostlinePoc` / `af-south-1`, host `i-0abac95ff3acf0d6a`, EIP `16.28.130.178`. One Ubuntu x86_64 t3.small and encrypted 20 GiB gp3, retained EIP, no bootstrap/runtime IAM roles. [Cape Town evidence](../docs/launch-cape-town.md).
- Frankfurt was retired on 2026-09-07 at Anthony’s request. CloudFormation `DELETE_COMPLETE`; host terminated, disk/network removed and retained EIP `3.69.128.6` explicitly released. No Frankfurt volumes, addresses, owned snapshots or active stacks remain. The existing default VPC has zero network interfaces and was left alone; no non-terminated regional EC2 instances remain. [Retirement evidence](../docs/launch.md#retirement).
- Named configurations remain `frankfurt` and `cape-town`; the catalog is a set of deployable recipes, not live inventory. Do not redeploy Frankfurt without authorization. Its old address is no longer ours; saved `Server 1`/Frankfurt client entries and outputs are obsolete.
- AmneziaVPN 5.0.1.5 installed XRay 26.7.28 on both during launch. Runtime installation remains manual, independent of IaC; matching defaults do not imply deterministic image builds.
- Last observed Mac connection is `Ghostline Cape Town`. Anthony confirmed Cape Town macOS/iOS practical tests passed. Individual subtests were not separately enumerated. Keep Private Relay enabled and Proton disconnected.
- Shared billing dimensions remain Project=ghostline, Environment=prod, System=xray/shared; use native billing Region grouping. Reference repository unchanged.
- Cape Town ignored secrets: `.local/keys/ghostline-poc-cape-town`, `.local/recovery/ghostline-cape-town-iphone.vpn`, `.local/recovery/ghostline-two-exits.backup`. Historical Frankfurt keys/exports remain locally; modes 600, recovery directory 700. Anthony intermediates LastPass activity; Cape Town vault saves remain unconfirmed.
- Regional deployment implementation committed as `8123ed4`; current uncommitted work records Frankfurt retirement. No source-code or index changes this turn.

## Next steps

1. Use Cape Town; remove obsolete Frankfurt profiles from devices. The two-exit backup contains a retired server entry and must not be treated as current inventory. Confirm LastPass saves of the active endpoint’s key/profile/backup.
2. Debug actual failures from the complete setup. Disconnect the Mac tunnel before SSH/Amnezia server administration. Do not broaden the SSH /32 to work around client routing.
3. Keep lifecycle automation deferred. Future deletions must explicitly handle retained EIPs and runtime recovery; preserving a catalog entry does not retain cloud resources.

## Verification and environment

- Retirement: fresh Frankfurt preflight/CDK diff passed with no differences; deployed template confirmed EIP Retain and root disk delete-on-termination. Deleted only the exact Frankfurt stack ARN, waited for completion, then verified the EIP was disassociated before release.
- After retirement: Frankfurt instance terminated; zero volumes, addresses, owned snapshots or active stacks, and zero interfaces in the deleted project VPC. Cape Town stack/output identities unchanged; instance running with instance/system/EBS health all `ok`. No new device browsing test claimed.
- Last code gate: Node 24.20.0 `npm test` passed typecheck, fresh offline synthesis for both recipes and all 42 Vitest tests. This turn changes documentation only; live lifecycle checks, all 75 non-archive local documentation links, scope review and `git diff --check` passed.
- Named commands from infra: `npm run deploy cape-town`; the same positional target applies to `preflight`, `synth` and `diff`. `--` is unnecessary for positional targets. See `docs/development.md` for launch inputs; outputs live under `.local/deployments/<target>/` and can outlive their resources.
- Local Node 24: `.local/node-v24.20.0-darwin-arm64/bin`; system Node is 26. Set NPM_CONFIG_CACHE=/tmp/ghostline-npm-cache in this sandbox.
- Managed npm environment: follow ignored `AGENTS.local.md` and omit only `npm_config_http_proxy` / `NPM_CONFIG_HTTP_PROXY` for npm invocations. Preserve supported proxies/warnings; upstream injection remains outside Ghostline.
- AWS/SSH require sandbox escalation here. AMI/AZ portability warnings are expected for explicit regional pins; preflight verifies availability. Qt client observations are in `.context/knowledge/amnezia.md`.
