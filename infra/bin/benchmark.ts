import { App, Tags } from 'aws-cdk-lib';
import { getDeployment, deploymentIds } from '../lib/config.js';
import { BenchmarkProbeStack, BenchmarkStorageStack } from '../lib/benchmark/stack.js';
const [campaign, region, kind, assetPath] = process.argv.slice(2);
if (!campaign || !/^[a-z][a-z0-9-]{0,30}$/.test(campaign) || !region || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)
  || !['probe', 'fixture'].includes(kind ?? '') || !assetPath) throw new Error('Invalid benchmark stack inputs.');
const base = getDeployment(deploymentIds[0]);
const app = new App();
const tags = { ...base.globalTags, System: 'benchmark', BenchmarkCampaign: campaign, BenchmarkOwner: process.env.GHOSTLINE_BENCHMARK_OWNER ?? 'offline' };
for (const [key, value] of Object.entries(tags)) Tags.of(app).add(key, value);
const props = { env: { account: base.account, region }, campaign, tags };
// Stable campaign names allow interrupted first creation to converge without adopting foreign resources.
if (kind === 'fixture') new BenchmarkStorageStack(app, `GhostlineBenchmark-${campaign}-fixture`, { ...props, fixture: true });
else {
  new BenchmarkStorageStack(app, `GhostlineBenchmark-${campaign}-assets`, { ...props, fixture: false });
  new BenchmarkProbeStack(app, `GhostlineBenchmark-${campaign}-probe`, { ...props, assetPath });
}
