import { getDeployment, getPublication } from '../lib/config.js';
import { deployReleaseRegion, persistPublication, reconcileReplication, registry, seedRegion, verifyAccount } from '../lib/releases/operator.js';
import { readRelease } from '../lib/releases/registry.js';
import { releaseRepository, releaseSelector } from '../lib/releases/model.js';
const [target, source, expected] = process.argv.slice(2);
if (!process.env.GHOSTLINE_CATALOG || !process.env.GHOSTLINE_BENCHMARK_OWNER || !target?.startsWith('bm-') || !source || !expected) throw new Error('Benchmark activation requires an explicit campaign.');
const config = getDeployment(target);
verifyAccount();
const profile = getPublication(), old = [...profile.members];
if (profile.retainedMembers.includes(config.region)) throw new Error('Cannot benchmark a retained publisher.');
if ((await readRelease(registry(source), releaseRepository, releaseSelector))?.digest !== expected) throw new Error('Release changed before benchmark activation.');
// Reuse source identities/history and membership machinery without redeploying production release stacks.
await deployReleaseRegion(config.region, false);
await seedRegion(registry(source), registry(config.region));
profile.members = [...new Set([...old, config.region])];
persistPublication(profile);
const pending = await reconcileReplication(profile, old);
if (pending.length) throw new Error('Benchmark replication enrollment incomplete.');
