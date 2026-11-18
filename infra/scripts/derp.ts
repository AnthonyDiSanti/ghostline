import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { resolve } from 'node:path';
import { getDeployment } from '../lib/config.js';
import { withLifecycle } from '../lib/lifecycle-operator.js';
import { reportTrialExclusion } from '../lib/releases/trial-exclusions.js';
import { provisionDerpIdentity } from '../lib/derp-provisioning.js';
import { credentials, root, verifyAccount } from '../lib/releases/operator.js';
import { maintainedProbeConfig, probePublicDerp } from '../lib/derp-client-probe.js';

const [target, action, ...extra] = process.argv.slice(2);
if (!['provision', 'status', 'test'].includes(action ?? '') || (action === 'test' ? extra.length !== 2 || extra[0] !== '--via' : extra.length !== 0)) {
  throw new Error('Usage: npm run derp -- <target> <provision|status|test --via maintained-target>');
}
const config = getDeployment(target), client = new SSMClient({ region: config.region, credentials });
try {
  verifyAccount();
  if (action === 'test') await probePublicDerp(config, maintainedProbeConfig(extra[1]!));
  else if (action === 'status') {
    // Map publication/probes need only this public fingerprint document, never the server SecureString.
    const result = await client.send(new GetParameterCommand({ Name: `${config.parameterPrefix ?? '/ghostline/prod'}/derp/public` }));
    console.log(JSON.stringify({ target, ...JSON.parse(result.Parameter?.Value ?? '{}') }, null, 2));
  } else {
    await withLifecycle(config, 'derp-provision', async () => {
      const response = await new CloudFormationClient({ region: config.region, credentials }).send(new DescribeStacksCommand({ StackName: config.stackName }));
      const ip = response.Stacks?.[0]?.Outputs?.find(output => output.OutputKey === 'AwgEndpointIp')?.OutputValue;
      if (!ip) throw new Error('Allocate the normal retained endpoint addresses before DERP identity provisioning.');
      const result = await provisionDerpIdentity(client, config, ip, resolve(root, '.local/deployments', config.id, 'derp'));
      console.log(JSON.stringify({ target, ...result }, null, 2));
    });
  }
} catch (error) {
  if (reportTrialExclusion(error)) { process.exitCode = 3; }
  else {
  console.error(error instanceof Error && error.constructor === Error ? error.message : `DERP operation failed (${(error as Error).name}); details withheld.`);
  process.exitCode = 1;
  }
}
