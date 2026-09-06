# Private Connectivity Service — Decision and Open-Question Register

**Draft v0.3 · 6 September 2026 · 16 answered / 0 blocking / 3 deferred**

This register accompanies the v0.3 PRD. Decisions below supersede earlier working assumptions; proposed implementation choices are identified as such.

## Answered decisions

**16 answered current decisions. No blocking product questions.** Original IDs are retained; later answers supersede earlier assumptions. Implementation values such as an AMI, account ID, exact phone OS or runtime version are filled in during setup.

| ID | Captured decision |
| --- | --- |
| Q01 | One owner and two devices first. Independent friend access is optional later; never share owner credentials. |
| Q02 | macOS, Windows, iOS, Android and Linux/OpenWrt router backhaul remain platform targets. Actual laptop/phone first. |
| Q03 | Disclosed best-effort mobile protection accepted; kill switch is nice to have. |
| Q04 | Private blocked-site browsing and video are primary. Geographic streaming access is deferred by Q16. |
| Q05 | Full-device protection preferred; no elaborate split-routing feature is required. |
| Q06 | Choose a reasonably performant non-local region for Dubai without a region-benchmark gate. Frankfurt is the document's engineering default, not a measured fastest-region claim. |
| Q07 | Ordinary travel usage; no formal budget needed for design. |
| Q08 | Both paths on AWS, with separate containers and EIPs. Separate EC2 hosts first for simplicity; sharing compute later is acceptable. No HA placement mandate. |
| Q09 | Existing clients first; custom clients or an on-demand management surface may follow. |
| Q10 | AWS CDK / TypeScript; maximize community reuse. Amnezia is the initial runtime/client candidate, not an irrevocable dependency. |
| Q11 | Existing production AWS account; Anthony is the only administrator. Isolate project resources within that account. |
| Q12 | Privacy-oriented, minimal logging if any. Disable routine traffic logging; no required alerting or observability service. |
| Q13 | 4K desired; acceptance is a successful, stable connection, not a resolution or numeric reliability standard. |
| Q14 | Manual setup and repair accepted. No recovery solution required when AWS access is unavailable. |
| Q15 | OpenWrt and third-party packages accepted. GL.iNet UI on/off control is a soft later goal; router work does not block the PoC. |
| Q16 | Defer geo-masquerading and Netflix/other streaming-catalog acceptance. Focus on bypassing current local filtering. |

## Deferred questions and engineering backlog

**Q17 — On-demand lifecycle.** Later decide whether to start/stop retained hosts or create/destroy endpoints, and which management interface is useful. No controller now.

**Q18 — Trusted-friend sharing.** Later decide friend/device count and onboarding. Independent credentials remain the baseline; no multi-user product now.

**Q19 — Future Fargate addressing.** Only if Fargate is pursued: must each protocol retain both a dedicated ingress EIP and a matching stable egress identity, or is stable ingress with different/shared egress acceptable? The direct EC2 design preserves both without reopening this now.

Engineering backlog: precise instance/AMI and versions; REALITY parameters; secret restore procedure; client coverage; secondary protocol selection; consolidated container source-IP routing; future router model/firmware/package/UI integration. These are not additional PoC approval gates.

## Implementation defaults

Frankfurt (`eu-central-1`), a dedicated VPC in the existing production AWS account, one useful Xray/REALITY endpoint before expansion, CDK-owned infrastructure, and an Amnezia-managed/manual runtime pilot are engineering defaults. Separate EC2 hosts are an initial simplicity choice, not an availability requirement. Shared EC2 compute is the recommended consolidation path; Fargate is conditional on a later networking/runtime design.

No further product questionnaire is required to begin the PoC. Actual deployment identifiers, device versions, and software settings are execution inputs.
