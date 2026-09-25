import { execFileSync } from 'node:child_process';
import { accountAudit } from '../lib/cloudtrail/operator.js';
import { deploymentIds, getDeployment } from '../lib/config.js';

const [region, action = 'check', ...extra] = process.argv.slice(2);
if (extra.length || !region || !/^[a-z]{2}-[a-z]+-\d$/.test(region) || !['check', 'ensure'].includes(action)) {
  throw new Error('Usage: npm run audit <region> [check|ensure]');
}
const account = getDeployment(deploymentIds[0]).account;
// Verify the selected account before any account-wide invariant can be created.
const caller = JSON.parse(execFileSync('aws', ['--profile', process.env.AWS_PROFILE ?? 'personal', 'sts', 'get-caller-identity', '--output', 'json'], { encoding: 'utf8' }));
if (caller.Account !== account) throw new Error('AWS account mismatch.');
console.log(JSON.stringify(await accountAudit(account, region, action as 'check' | 'ensure'), null, 2));
