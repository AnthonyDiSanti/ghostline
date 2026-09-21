import { App, Tags } from 'aws-cdk-lib';
import { deploymentIds, getDeployment, getPublication } from '../lib/config.js';
import { RegionalReleaseStack, ReleaseAssetsStack, releaseStackName, assetStackName } from '../lib/releases/stack.js';
import cdk from '../cdk.json' with { type: 'json' };

const [region, ...extra] = process.argv.slice(2);
const publication = getPublication();
const catalog = deploymentIds.map(getDeployment);
if (!region || extra.length || ![publication.primaryRegion, publication.disasterRecoveryRegion, ...publication.subscribers].includes(region)) {
  throw new Error('Select an enrolled release region.');
}
const app = new App({ context: cdk.context });
for (const [key, value] of Object.entries(catalog[0]!.globalTags)) Tags.of(app).add(key, value);
Tags.of(app).add('System', 'shared');
const gateway = publication.subscribers.includes(region) ? catalog.find(c => c.region === region)?.resourceName : undefined;
const env = { account: catalog[0]!.account, region };
if (gateway) new ReleaseAssetsStack(app, assetStackName, { env });
new RegionalReleaseStack(app, releaseStackName, { env, gateway,
  automation: publication.automation });
