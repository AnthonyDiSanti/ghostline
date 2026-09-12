# Regional launch and expiration — discussion draft

2026-09-10. Anthony requested brainstorming, not implementation or changes to live exits. Preferences about the management interface and idle semantics are pending. This proposal does not change current acceptance gates.

Implementation update: [ECS trial](../../../docs/ecs.md) now supplies explicit start/stop, ECR releases and regional Parameter Store restoration. The lifetime, activity reporting and remote controller proposals below remain deferred; the pre-ECS dependency description is historical.

## Recommended model

Separate two settings for each named regional exit:

- **Lifetime:** permanent (manual removal only), or idle timeout after the last observed authenticated client presence on either protocol. Optionally offer a fixed expiry for a temporary trial; this is different from an idle timeout and can interrupt connected clients.
- **On expiry:** stop (retain host/disk/IPs), park (delete host/disk/networking, retain tracked IPs), or release (delete regional resources including IPs). Preserve credentials independently in all cases. Permanent means exempt from expiration, not HA or self-healing.

Proposed initial presets: a permanent primary, an idle-stopped familiar backup, and idle-released experimental regions. These are suggestions, not policies to apply to Stockholm or Cape Town without a subsequent implementation/deployment instruction. A region catalog entry allocates nothing.

Existing `EndpointStack`, `park`, and scoped `destroy` supply the regional resource operations. Stop/start, policy storage, activity measurement, automated orchestration and endpoint discovery remain new work. `deploy` currently restores infrastructure only; local SSH/bootstrap/image transfer and preserved credential installation are separate steps.

## User interaction

Present region, state, lifetime, expiration action, retained-IP cost and time remaining. Actions: Launch, Extend, Keep running, and Shut down. Launch becomes Ready only after both runtimes pass readiness checks; device reachability remains separate. The user then selects the existing Amnezia profile manually. An ordinary VPN packet cannot wake a removed EC2 host; the launch action must work outside that tunnel.

CLI-only is the smallest interface and can keep protected local installation material. A small authenticated page usable on Mac/iPhone is the more convenient destination, but independent launches need durable artifacts/secrets and a cloud execution path. Do not put AWS admin credentials in a browser or require the laptop to stay awake to expire an exit.

## What idle means

Recommended first semantics: keep running while either protocol has recent authenticated evidence from any device; start the idle grace after the latest evidence. Refresh for ongoing use, not just the initial connection. Allow a launch/first-connection grace and a separate bounded provisioning deadline. A proposed default is 60 minutes of idle time, configurable per exit and per launch.

The server cannot perfectly observe the client's VPN toggle. AWG is connectionless and our generated profiles have `PersistentKeepalive = 25-35`; handshake/receive metadata can infer peer liveness, but a timestamp is not an exact disconnect event. WireGuard explains [persistent keepalives](https://www.wireguard.com/quickstart/). Verify the installed AWG implementation's counters before treating them as an authoritative presence signal.

Xray exposes user traffic and online statistics; current docs define online as activity within 20 seconds. That is not a durable device session. Our generator currently enables neither statistics nor user email labels, so a minimal localhost-only instrumentation change needs validation against pinned Xray 26.7.28. Do not assume current documentation proves the pinned implementation's behavior. [Xray policy](https://xtls.github.io/en/config/policy.html), [statistics](https://xtls.github.io/en/config/stats.html).

Do not use EC2 network bytes, open TCP sockets or public-port probes as authenticated presence: scans, REALITY camouflage, SSH, health checks and updates must not extend a lease. Do not collect browsing destinations or query logs. Persist only the latest aggregate authenticated-activity time and reporter health, plus minimal lifecycle state. Quiet connected Xray devices and sleeping iPhones need real trials; if exact client-toggle presence is required, explicit client heartbeats would be additional client work.

“No browsing” is a different policy: AWG keepalives would need exclusion, but ordinary background traffic can still prevent expiration. The server cannot reliably infer whether a human is actively using the screen. A fixed session expiry is more predictable when a firm runtime cap is desired; make its interruption behavior explicit and optional.

## Small shared controller

One home-region serverless management deployment can control allowlisted regional stacks. Candidate components: authenticated management endpoint, Lambda handlers, a small DynamoDB state table and one EventBridge Scheduler tick every minute. Hosts send authenticated aggregate activity/health using a narrow host identity; only the controller can mutate regional infrastructure. No dedicated management EC2, NAT gateway, NLB, cross-region peering or controller copy per exit is necessary for this proposal.

One periodic scan of a few exit records is simpler than rescheduling a timer per packet. Check stored deadlines explicitly: [DynamoDB TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html) deletes asynchronously over days and is not a shutdown timer. [Scheduler](https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html) has minute-level precision; cleanup completion will take longer. One tick/minute is about 43,800 monthly invocations, well below the current advertised 14 million Scheduler free invocations, although Lambda, storage, authentication, logs and deployment execution have their own pricing. [EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/).

Store policy, deadline, desired/observed state, report freshness, exact stack/resource ownership and a generation per exit. Serialize changes. Recheck deadline and generation before cleanup so an old invocation cannot delete a relaunched or newly permanent exit. Retry captured cleanup safely; move today's local pending-release journal to durable state for cloud execution. If telemetry is stale, show Unknown and retain the host pending a fresh check; do not equate a monitoring failure with an idle client. An optional separately authorized hard expiry can bound that spend.

Long deployments should run asynchronously with persisted progress. A workflow or on-demand CodeBuild job can reuse deployment logic; a Lambda should not sit waiting for CDK and runtime builds, given its [15-minute limit](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html). [CodeBuild on-demand pricing](https://aws.amazon.com/codebuild/pricing/) makes a runner without reserved fleet capacity a candidate, not a selected implementation.

## Main engineering dependency: unattended restoration

Current scripts use local Docker archives, local recovery files, the personal AWS profile and pinned SSH restricted to the operator's /32. A cloud runner cannot simply execute them unchanged. Factor reusable lifecycle/runtime logic from CLI entry points. For independent remote launches, consider immutable nonsecret release archives in S3 and namespaced SecureString Parameter Store credentials, with a narrow bootstrap role letting each host fetch only its own material. No client keys in AMIs, userdata or logs; LastPass stays Anthony-mediated recovery. This would deliberately introduce previously deferred cloud artifact/secret/IAM plumbing for a concrete consumer. It is not authorized by brainstorming alone. ECR is an alternative image transport, not a requirement to move compute to ECS.

Build releases once rather than rebuilding dependencies for every launch. Preserve regional/device credential identity; restoration never silently rotates it. Readiness, bootstrap failure handling and measured launch latency matter more than the button itself. No launch-time benchmark is promised yet.

## Addresses and cost

Stop retains EBS and EIPs and removes compute charges; park removes EBS as well; release removes the regional IP floor. [EC2 stop/start](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/how-ec2-instance-stop-start-works.html). Two EIPs cost `2 × $0.005 × 730 = $7.30/month` even while idle, before disk or other resources. [VPC pricing](https://aws.amazon.com/vpc/pricing/). Existing Cape Town disk figures in the lifecycle assessment are not Stockholm prices. No exact all-in controller cost estimate was prepared.

Released IPs require new profile endpoints. Stable per-region, per-protocol DNS names are a candidate, separate from REALITY's camouflage server name. Validate hostname import and DNS re-resolution on native Mac/iOS clients after IP changes before promising permanent profiles with disposable IPs. Existing generators accept literal IPv4 only. Initially refreshing links/QRs is explicit but less convenient. Keep EIPs only where avoiding that friction justifies their cost.

Continue `Project=ghostline`, `Environment=prod`, resource-owned `System` (shared for controller/host/networking and protocol-specific for EIPs), with native billing Region for consolidated analysis.

## Questions for the next discussion

- Should a quiet but connected phone keep the exit alive, or should the policy aim at inactivity/fixed expiry?
- Is Mac CLI launch sufficient, or should an iPhone launch work with the Mac asleep?
- Is a new profile import acceptable after disposable regional tests, pending DNS validation?

Candidate implementation scope once selected: one Launch operation, lifetime/cleanup policies, a controller independent of the exits, privacy-minimal activity reporting, durable restore and end-to-end expiration/relaunch tests across both protocols. Preserve current exits until their policy changes are explicitly requested.
