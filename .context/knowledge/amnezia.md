# Amnezia client notes

Server settings/generation preserve selected upstream protocol behavior; licensing and current image provenance live in [runtime notice](../../runtime/NOTICE.md) and [images](../../docs/images.md). Amnezia is not a server installer dependency.

Use [Mac client stability](../../docs/mac-client-stability.md) for invisible-window recovery, configd/sleep incidents, OneXraySE installation/routing, supported disconnect commands and credential-preserving imports. The raw daemon-socket watchdog was retired after a correlated service crash; do not reuse ignored scripts as trusted recovery. Repeated sleep/wake and IPv6-capable-network testing remain separate.

For phone imports, standard VLESS links and Amnezia-wrapped AWG configs/QRs are generated locally from protected profiles by `profile-share.ts`. Links and QR contents are secrets; never publish them to an external QR service or print them into model context. Protocol detection and app version compatibility need actual client evidence.
