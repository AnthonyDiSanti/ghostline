import { App, Tags } from 'aws-cdk-lib';
import { readFileSync } from 'node:fs';
import { getDeployment } from '../lib/config.js';
import { buildApp } from '../lib/app.js';
import { gatewayPlatform } from '../lib/gateway-platform.js';
import { guardDutyForDeployment } from '../lib/guardduty-discovery.js';
import { applicationArtifacts } from '../lib/image-artifacts.js';
import { capturedTrialTemplates, parseCandidate, type CandidateTrial } from '../lib/releases/candidates.js';
import { RegionalReleaseStack, releaseStackName } from '../lib/releases/stack.js';
import cdk from '../cdk.json' with { type: 'json' };

const [target, kind, candidateFile, trialFile, ...extra] = process.argv.slice(2);
if (extra.length || !['gateway', 'release'].includes(kind ?? '') || !candidateFile || !trialFile) throw new Error('Select a captured native trial.');
const config = getDeployment(target), support = guardDutyForDeployment(config);
const candidate = parseCandidate(JSON.parse(readFileSync(candidateFile, 'utf8')));
const trial = JSON.parse(readFileSync(trialFile, 'utf8')) as CandidateTrial;
if (candidate.target !== config.id || candidate.account !== config.account || candidate.region !== config.region) throw new Error('Candidate scope mismatch.');
const refs = Object.fromEntries(Object.entries(candidate.intent.images).map(([name, image]) =>
  [name, `${config.account}.dkr.ecr.${config.region}.amazonaws.com/${image.repository}@${image.digest}`]));
const platform = { bootstrap: refs.bootstrap!, daemon: refs['network-daemon']! };
if (kind === 'gateway') {
  // Use exactly the maintained regional graph with immutable trial image inputs.
  buildApp(config, support, {}, 'active', { platform: gatewayPlatform(config, support.runtime, 'a', platform),
    images: Object.fromEntries([...applicationArtifacts, ...(config.dnsRequired ? ['dns-policy'] : []), ...(config.derp ? ['derp'] : [])]
      .map(name => [name, refs[name]])) as any });
} else {
  const app = new App({ context: cdk.context });
  const tags = { ...config.globalTags, System: 'shared' };
  for (const [key, value] of Object.entries(tags)) Tags.of(app).add(key, value);
  new RegionalReleaseStack(app, releaseStackName, { env: { account: config.account, region: config.region }, tags,
    deployment: config, guardDuty: support.runtime, automation: 'manual', candidatePlatformImages: platform,
    capturedHostTemplates: capturedTrialTemplates(trial, { account: config.account, region: config.region, endpoint: config.stackName }) });
}
