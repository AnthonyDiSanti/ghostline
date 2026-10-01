import { App, Tags } from 'aws-cdk-lib';
import { deploymentIds, getDeployment, getPublication } from '../lib/config.js';
import { RegionalReleaseStack, ReleaseAssetsStack, releaseStackName, assetStackName } from '../lib/releases/stack.js';
import { guardDutyForDeployment } from '../lib/guardduty-discovery.js';
import cdk from '../cdk.json' with { type: 'json' };

const [region, mode = 'active', ...extra] = process.argv.slice(2);
const publication = getPublication();
const catalog = deploymentIds.map(getDeployment);
if (!region || extra.length || !['active', 'held'].includes(mode)
  || (!publication.members.includes(region) && !catalog.some(c => c.region === region))) {
  throw new Error('Select an enrolled release region.');
}
const app = new App({ context: cdk.context });
for (const [key, value] of Object.entries(catalog[0]!.globalTags)) Tags.of(app).add(key, value);
Tags.of(app).add('System', 'shared');
const endpoint = catalog.find(c => c.region === region);
const gateway = endpoint?.resourceName;
const env = { account: catalog[0]!.account, region };
// Stack ownership must be explicit as well as propagated to billable resources.
const tags = { ...catalog[0]!.globalTags, System: 'shared' };
if (gateway) new ReleaseAssetsStack(app, assetStackName, { env, tags });
new RegionalReleaseStack(app, releaseStackName, { env, tags, deployment: endpoint, guardDuty: endpoint ? guardDutyForDeployment(endpoint).runtime : undefined,
  automation: publication.automation && mode === 'active' });
