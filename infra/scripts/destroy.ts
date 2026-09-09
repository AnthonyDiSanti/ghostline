import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { getDeployment } from '../lib/config.js';
import { captureRelease, releaseAfterDeletion, type ReleaseRecord } from '../lib/lifecycle.js';

const [target, ...extra] = process.argv.slice(2);
if (extra.length) throw new Error('Usage: npm run destroy <deployment>');
const config = getDeployment(target);
const folder = fileURLToPath(new URL(`../../.local/deployments/${config.id}/`, import.meta.url));
const recordPath = resolve(folder, 'pending-release.json');
function aws(args: string[]): any {
  // Only scoped lifecycle metadata is read; no launch credentials or AMI lookup is needed for teardown.
  const result = execFileSync('aws', ['--profile', 'personal', '--region', config.region, ...args, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return result.trim() ? JSON.parse(result) : {};
}
if (aws(['sts', 'get-caller-identity']).Account !== config.account) throw new Error('AWS account mismatch.');
mkdirSync(folder, { recursive: true, mode: 0o700 });
let record: ReleaseRecord;
if (existsSync(recordPath)) {
  record = JSON.parse(readFileSync(recordPath, 'utf8'));
  // Resuming targets the original ARN, so a new stack with the same name cannot be destroyed accidentally.
  if (record.account !== config.account || record.region !== config.region
    || !record.stackId.startsWith(`arn:aws:cloudformation:${config.region}:${config.account}:stack/${config.stackName}/`)) {
    throw new Error('Pending release record is outside this deployment.');
  }
} else {
  const stack = aws(['cloudformation', 'describe-stacks', '--stack-name', config.stackName]).Stacks[0];
  const resources = aws(['cloudformation', 'list-stack-resources', '--stack-name', stack.StackId]).StackResourceSummaries;
  record = captureRelease(config, stack, resources);
  writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
console.log(`Destroying ${config.id}; releasing only ${record.allocations.join(', ')} after stack deletion.`);
const stack = aws(['cloudformation', 'describe-stacks', '--stack-name', record.stackId]).Stacks[0];
if (stack.StackStatus !== 'DELETE_COMPLETE') {
  aws(['cloudformation', 'delete-stack', '--stack-name', record.stackId]);
  aws(['cloudformation', 'wait', 'stack-delete-complete', '--stack-name', record.stackId]);
}
releaseAfterDeletion(config, record, aws);
renameSync(recordPath, resolve(folder, 'last-release.json'));
console.log('Stack deleted and captured EIPs released. Local credentials remain available; new IPs require new client endpoint settings.');
