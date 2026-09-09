# Supplemental agent knowledge

Start here before vendor/infrastructure integration work. Stable Ghostline behavior lives in `docs/`; these notes help future agents retrieve or interpret evidence.

- [Amnezia/runtime notes](amnezia.md) — installer pitfalls, credential migration, cloud-init addressing and userspace AWG startup.
- [On-demand platform/cost assessment](../../docs/deployment-lifecycle.md) — Fargate TUN/NET_ADMIN limitation, idle EIP costs, stopped EC2 versus cold rebuild, and public AWS rate provenance.
- [Fallback protocol selection](protocol-selection.md) — stealth-first comparison of AmneziaWG, NaïveProxy and Hysteria 2; evidence limits and Apple client availability.
- [Reference repository notes](reference-repository.md) — location, provenance, stale-note pitfalls, and safe reuse boundaries for personal-assistant.
- [Region/privacy research](../../docs/region-selection.md) — Stockholm intended trial and Milan comparison (Piracy Shield); Frankfurt is the owner-proven performance baseline. Owner exclusion of Tel Aviv, European comparison and 2026 policy watch. Cape Town remains live and should be retained as backup: prior device trials passed, but Anthony reports both protocols too slow as of 2026-09-09. Stockholm is now deployed; [launch evidence](../../docs/launch-stockholm.md) records Mac Xray and guarded native AWG passes after an initial interruption, verified local automatic disconnect recovery, and pending iOS/owner practical trials.

Add a topic only when it prevents repeated investigation. Link useful external documentation from the canonical topic that depends on it; do not build a parallel vendor-doc encyclopedia here.
