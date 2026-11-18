# Account EIP quota status — November 16, 2026

Owner-selected target: **20 EIPs per enabled commercial region** across account `757999402784`, profile `personal`. Quota is **Amazon EC2 → EC2-VPC Elastic IPs**, service `ec2`, code `L-0263D0A3`; it is regional, not under the VPC service. Consult before relying on deployment headroom or submitting another increase.

## Live readback at 14:17:48 UTC

- Fresh region enumeration finds 34 enabled commercial regions.
- **All 33 submitted requests are APPROVED.** Independently fetched each original request by its request ID, including terminal statuses.
- **All 33 reachable regions report applied value 20.** No submitted request remains pending or denied. Oregon, NVA, Stockholm, Zurich and Cape Town all have the new quota.
- **Bahrain `me-south-1` remains the only exception:** its standard Service Quotas endpoint still connect-times out; no request was submitted there, and its applied value remains unknown. The earlier submission attempt also failed through the SDK dual-stack endpoint, and the alternate Support API required Premium Support. No region activation, address allocation or additional quota write occurred during this refresh.

Private submission receipts are preserved in ignored `.local/quota-requests-2026-11-16/submission-receipts.json`, copied from the earlier worktree. Current request IDs/statuses and applied values are in `current-status.json` alongside them (directory 0700, files 0600). Original planning files remain in the earlier worktree; this note supersedes their dated pending-status snapshot for current quota state.

## Bahrain follow-up

Retry metadata when reachable or use the [Bahrain console quota entry](https://me-south-1.console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-0263D0A3). If needed, use AWS Support Center's service-quota flow. Request desired value **20** for `ec2` / `L-0263D0A3` in `me-south-1`, explaining regional gateway/blue-green deployment headroom. Check current history/applied value before submitting to avoid duplicates. No additional request is needed in the other 33 regions. No periodic monitor is deployed.

Evidence: STS GetCallerIdentity, EC2 DescribeRegions, regional Service Quotas GetServiceQuota and GetRequestedServiceQuotaChange. The values above are observed applied limits, not merely requested values; later regional operations should still read their current quota and allocations.
