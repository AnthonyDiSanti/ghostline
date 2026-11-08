import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { EC2Client, DescribeInstancesCommand, DescribeRegionsCommand } from '@aws-sdk/client-ec2';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { DescribeParametersCommand, GetParameterCommand, ListTagsForResourceCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateXrayProfiles } from './xray.js';
import { generateAwgProfiles } from './awg.js';
import { credentialParameters, importParameters } from './parameters.js';
import { parseJson } from './xray-config.js';
import type { DeploymentConfig } from './config.js';
import { alertParameterName, credentialNames, type InitializationPlan, type InitExecutionPorts,
  type InitInventory, type InitParameter, type InitReceipt, type InitSource } from './region-initialization.js';

const named = (error: unknown, name: string) => error instanceof Error && error.name === name;

function privateJson(path: string, value: unknown): void {
  // Atomic metadata receipts never contain generated credentials or the private alert contact.
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, path);
}

function protectedDirectory(path: string): void {
  // Reject an existing permissive operation directory rather than placing secrets beneath it.
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (statSync(path).mode & 0o077) throw new Error('Initialization operation directory must be private.');
}

export function stageFreshCredentials(folder: string): void {
  // One matching set is generated only during explicit initialization, never during deploy or retry.
  protectedDirectory(folder);
  const xray = generateXrayProfiles('192.0.2.1');
  const awg = generateAwgProfiles('192.0.2.1');
  for (const path of ['server', 'clients/macos', 'clients/ios']) protectedDirectory(resolve(folder, path));
  const save = (path: string, value: string) => writeFileSync(resolve(folder, path), value, { flag: 'wx', mode: 0o600 });
  save('server/xray.json', JSON.stringify(xray.bundle)); save('server/awg.conf', awg.serverConfig);
  for (const device of ['macos', 'ios']) {
    save(`clients/${device}/xray.json`, JSON.stringify(xray.profiles[device]));
    save(`clients/${device}/awg.conf`, awg.profiles[device]!);
  }
  credentialParameters(folder); // Validate matching native identities before publishing the staged operation.
}

export function initializationOperator(config: DeploymentConfig, root: string) {
  const credentials = fromIni({ profile: 'personal' });
  const options = (region: string) => ({ region, credentials, maxAttempts: 1 });
  const ssm = new SSMClient(options(config.region));
  const expectedNames = [...credentialNames(config), alertParameterName];

  async function metadata(client: SSMClient, names: string[]): Promise<InitParameter[]> {
    // DescribeParameters and resource tags expose metadata only; plans never call GetParameter.
    const result: InitParameter[] = [];
    let NextToken: string | undefined;
    do {
      const page = await client.send(new DescribeParametersCommand({ ParameterFilters: [{ Key: 'Name', Option: 'Equals', Values: names }], NextToken }));
      for (const parameter of page.Parameters ?? []) {
        if (!parameter.Name || !parameter.LastModifiedDate) throw new Error('Incomplete parameter metadata.');
        const tags = await client.send(new ListTagsForResourceCommand({ ResourceType: 'Parameter', ResourceId: parameter.Name }));
        result.push({ name: parameter.Name, type: parameter.Type as 'SecureString', tier: (parameter.Tier ?? 'Standard') as 'Standard',
          version: parameter.Version!, modified: parameter.LastModifiedDate.toISOString(),
          tags: Object.fromEntries((tags.TagList ?? []).map(tag => [tag.Key!, tag.Value!])) });
      }
      NextToken = page.NextToken;
    } while (NextToken);
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function observe(source?: InitSource): Promise<InitInventory> {
    // Account and opt-in checks precede target reads; publisher-only infrastructure is not an endpoint blocker.
    const identity = await new STSClient(options(config.region)).send(new GetCallerIdentityCommand({}));
    if (identity.Account !== config.account) throw new Error('AWS account mismatch; no initialization performed.');
    const regions = await new EC2Client(options('eu-central-1')).send(new DescribeRegionsCommand({ AllRegions: true }));
    const enabled = ['opted-in', 'opt-in-not-required'].includes(regions.Regions?.find(r => r.RegionName === config.region)?.OptInStatus ?? '');
    if (!enabled) throw new Error('Target region is not enabled; no initialization performed.');
    let endpointExists = false;
    try {
      endpointExists = !!(await new CloudFormationClient(options(config.region)).send(new DescribeStacksCommand({ StackName: config.stackName }))).Stacks?.length;
    } catch (error) {
      // Only an explicitly absent endpoint is safe; access and other CloudFormation failures remain errors.
      if (!(named(error, 'ValidationError') && (error as Error).message.includes('does not exist'))) throw error;
    }
    const hosts: string[] = [];
    let NextToken: string | undefined;
    do {
      const page = await new EC2Client(options(config.region)).send(new DescribeInstancesCommand({ NextToken, Filters: [
        { Name: 'tag:Project', Values: [config.globalTags.Project!] },
        { Name: 'tag:Environment', Values: [config.globalTags.Environment!] },
        { Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped', 'shutting-down'] },
      ] }));
      hosts.push(...(page.Reservations ?? []).flatMap(r => (r.Instances ?? []).map(i => i.InstanceId!)));
      NextToken = page.NextToken;
    } while (NextToken);
    const sourceParameter = source ? (await metadata(new SSMClient(options(source.region)), [alertParameterName]))[0] : undefined;
    return { account: identity.Account!, regionEnabled: enabled, endpointExists, hosts: hosts.sort(),
      parameters: await metadata(ssm, expectedNames), ...(sourceParameter ? { sourceParameter } : {}) };
  }

  function execution(plan: InitializationPlan): InitExecutionPorts {
    // The reviewed plan digest fixes the local staging namespace; receipts cannot redirect secret reads/writes.
    const work = resolve(root, config.id, plan.digest);
    const operation = resolve(work, 'operation');
    const receiptPath = resolve(operation, 'receipt.json');
    const stage = resolve(operation, 'credentials');
    const receipt = (): InitReceipt | undefined => {
      if (!existsSync(receiptPath)) return undefined;
      if (statSync(receiptPath).mode & 0o077) throw new Error('Initialization receipt must be private.');
      return parseJson(readFileSync(receiptPath, 'utf8')) as InitReceipt;
    };
    return {
      observe, receipt,
      prepare: selected => {
        // Publish staged files and their receipt in one directory rename, before the first remote write.
        protectedDirectory(work);
        if (existsSync(operation)) throw new Error('Unclaimed initialization operation exists; inspect before retrying.');
        const temporary = mkdtempSync(resolve(work, 'prepare-'));
        try {
          if (selected.actions.credentials === 'create') stageFreshCredentials(resolve(temporary, 'credentials'));
          privateJson(resolve(temporary, 'receipt.json'), { schemaVersion: 1, planDigest: selected.digest, phase: 'prepared' } satisfies InitReceipt);
          renameSync(temporary, operation);
        } finally { if (existsSync(temporary)) rmSync(temporary, { recursive: true }); }
      },
      importCredentials: async () => {
        if (!existsSync(stage)) throw new Error('Incomplete initialization lost its protected staging; explicit recovery is required.');
        return importParameters(ssm, config, credentialParameters(stage, config.parameterPrefix ?? '/ghostline/prod'));
      },
      copyAlert: async (source, expected) => {
        // Private contact values stay in memory. Version checks bind the copy to the reviewed source metadata.
        const original = (await new SSMClient(options(source.region)).send(new GetParameterCommand({ Name: alertParameterName, WithDecryption: true }))).Parameter;
        if (original?.Type !== 'SecureString' || original.Version !== expected.version
          || original.LastModifiedDate?.toISOString() !== expected.modified || !original.Value
          || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(original.Value.trim())) throw new Error('Reviewed alert source is invalid or changed.');
        let destination;
        try { destination = (await ssm.send(new GetParameterCommand({ Name: alertParameterName, WithDecryption: true }))).Parameter; }
        catch (error) { if (!named(error, 'ParameterNotFound')) throw error; }
        if (destination && (destination.Type !== 'SecureString' || destination.Value !== original.Value)) throw new Error('Conflicting alert destination; refusing overwrite.');
        if (!destination) await ssm.send(new PutParameterCommand({ Name: alertParameterName, Type: 'SecureString', Tier: 'Standard',
          Value: original.Value, Overwrite: false, Tags: [...Object.entries(config.globalTags).map(([Key, Value]) => ({ Key, Value })),
            { Key: 'System', Value: 'shared' }] }));
        const readback = (await ssm.send(new GetParameterCommand({ Name: alertParameterName, WithDecryption: true }))).Parameter;
        if (readback?.Type !== 'SecureString' || readback.Value !== original.Value) throw new Error('Alert contact equality verification failed.');
      },
      complete: value => privateJson(receiptPath, value),
      cleanup: () => {
        // Parameter Store is authoritative after completion; staging is not a mandatory local backup.
        if (receipt()?.phase === 'complete' && existsSync(stage)) rmSync(stage, { recursive: true });
      },
    };
  }
  return { observe, execution };
}
