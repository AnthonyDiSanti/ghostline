import { execFileSync } from 'node:child_process';
import { getPublication } from './config.js';
import type { PurgeInventory, PurgePorts, PurgeResource } from './regional-purge.js';

function call(region: string, args: string[]): any {
  // Only resource metadata is requested; no API call here decrypts parameters or reads log/queue contents.
  const output = execFileSync('aws', ['--profile', process.env.AWS_PROFILE ?? 'personal', '--region', region, ...args, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
  return output.trim() ? JSON.parse(output) : {};
}

function tagsOf(items: Array<{ Key?: string; Value?: string; key?: string; value?: string }> = []): Record<string, string> {
  return Object.fromEntries(items.map(item => [item.Key ?? item.key, item.Value ?? item.value]));
}

export function regionalPurgePorts(account: string, region: string): PurgePorts {
  if (!/^\d{12}$/.test(account) || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)) throw new Error('Explicit AWS account and region are required.');
  const aws = (args: string[]) => call(region, args);
  const assertAccount = () => {
    if (aws(['sts', 'get-caller-identity']).Account !== account) throw new Error('AWS account mismatch.');
    const publication = getPublication();
    if (publication.members.includes(region) || publication.retainedMembers.includes(region)) {
      throw new Error('The region is still a publication member; complete destroy before purge.');
    }
  };
  const resourceTags = (name: string): Record<string, string> => tagsOf(aws(['ssm', 'list-tags-for-resource',
    '--resource-type', 'Parameter', '--resource-id', name]).TagList);
  const parameterFingerprint = (parameter: any) => Number.isInteger(parameter?.Version)
    && typeof parameter?.LastModifiedDate === 'string' ? `${parameter.Version}:${parameter.LastModifiedDate}` : '';
  const inventory = async (): Promise<PurgeInventory> => {
    assertAccount();
    const blockers: string[] = [];
    // A destroyed region has no active Ghostline stack, host, endpoint, volume or regional image repository.
    const stacks = aws(['cloudformation', 'describe-stacks']).Stacks ?? [];
    if (stacks.some((s: any) => /^Ghostline/.test(s.StackName) && s.StackStatus !== 'DELETE_COMPLETE')) blockers.push('CloudFormation stack');
    const instances = (aws(['ec2', 'describe-instances', '--filters', 'Name=tag:Project,Values=ghostline',
      'Name=instance-state-name,Values=pending,running,stopping,stopped']).Reservations ?? [])
      .flatMap((r: any) => r.Instances ?? []);
    if (instances.length) blockers.push('EC2 instance');
    if ((aws(['ec2', 'describe-addresses', '--filters', 'Name=tag:Project,Values=ghostline']).Addresses ?? []).length) blockers.push('Elastic IP');
    if ((aws(['ec2', 'describe-volumes', '--filters', 'Name=tag:Project,Values=ghostline']).Volumes ?? []).length) blockers.push('EBS volume');
    if ((aws(['ec2', 'describe-vpcs', '--filters', 'Name=tag:Project,Values=ghostline']).Vpcs ?? []).length) blockers.push('VPC');
    if ((aws(['ec2', 'describe-network-interfaces', '--filters', 'Name=tag:Project,Values=ghostline']).NetworkInterfaces ?? []).length) blockers.push('network interface');
    if ((aws(['ecr', 'describe-repositories']).repositories ?? []).some((r: any) => r.repositoryName.startsWith('ghostline/'))) blockers.push('ECR repository');
    // These normally disappear with their stacks; an orphan must be reviewed before deleting credentials.
    if ((aws(['lambda', 'list-functions']).Functions ?? []).some((f: any) => /ghostline/i.test(f.FunctionName))) blockers.push('Lambda function');
    if ((aws(['dynamodb', 'list-tables']).TableNames ?? []).some((name: string) => /ghostline/i.test(name))) blockers.push('DynamoDB table');
    if ((aws(['sns', 'list-topics']).Topics ?? []).some((t: any) => /ghostline/i.test(t.TopicArn))) blockers.push('SNS topic');
    if ((aws(['events', 'list-rules']).Rules ?? []).some((rule: any) => /ghostline/i.test(rule.Name))) blockers.push('EventBridge rule');
    const alarms = aws(['cloudwatch', 'describe-alarms']);
    if ([...(alarms.MetricAlarms ?? []), ...(alarms.CompositeAlarms ?? [])]
      .some((alarm: any) => /ghostline/i.test(alarm.AlarmName))) blockers.push('CloudWatch alarm');
    if ((aws(['ecs', 'list-clusters']).clusterArns ?? []).some((arn: string) => /ghostline/i.test(arn))) blockers.push('ECS cluster');
    if ((aws(['ssm', 'list-documents', '--filters', 'Key=Owner,Values=Self']).DocumentIdentifiers ?? [])
      .some((document: any) => /ghostline/i.test(document.Name))) blockers.push('SSM document');
    if ((aws(['s3api', 'list-buckets']).Buckets ?? [])
      .some((bucket: any) => bucket.Name === `ghostline-release-assets-${account}-${region}`)) blockers.push('release asset bucket');

    const parameters: PurgeResource[] = (aws(['ssm', 'describe-parameters', '--parameter-filters',
      'Key=Name,Option=BeginsWith,Values=/ghostline/']).Parameters ?? [])
      .map((p: any) => ({ id: p.Name, tags: resourceTags(p.Name), fingerprint: parameterFingerprint(p) }));
    const logGroups: PurgeResource[] = (aws(['logs', 'describe-log-groups']).logGroups ?? [])
      .filter((g: any) => /ghostline/i.test(g.logGroupName))
      .map((g: any) => ({ id: g.logGroupName, tags: aws(['logs', 'list-tags-for-resource',
        '--resource-arn', g.arn.replace(/:\*$/, '')]).tags ?? {} }));
    const queues: PurgeResource[] = (aws(['sqs', 'list-queues']).QueueUrls ?? [])
      .filter((url: string) => /ghostline/i.test(url))
      .map((url: string) => ({ id: url, tags: aws(['sqs', 'list-queue-tags', '--queue-url', url]).Tags ?? {} }));
    const taskDefinitions: PurgeResource[] = ['ACTIVE', 'INACTIVE', 'DELETE_IN_PROGRESS']
      .flatMap(status => (aws(['ecs', 'list-task-definitions', '--status', status]).taskDefinitionArns ?? []) as string[])
      .filter(arn => /ghostline/i.test(arn)).map(arn => {
        const record = aws(['ecs', 'describe-task-definition', '--task-definition', arn, '--include', 'TAGS',
          '--query', '{status:taskDefinition.status,tags:tags}']);
        return { id: arn, status: record.status, tags: tagsOf(record.tags) };
      });
    return { account, region, blockers, parameters, logGroups, queues, taskDefinitions };
  };
  const owned = (resource: PurgeResource | undefined, kind: string) => {
    if (!resource || resource.tags.Project !== 'ghostline' || resource.tags.Environment !== 'prod') {
      throw new Error(`${kind} ownership changed; stop and review.`);
    }
  };
  return {
    inventory,
    removeParameter: async (name, fingerprint) => {
      owned({ id: name, tags: resourceTags(name) }, 'Parameter');
      const current = (aws(['ssm', 'describe-parameters', '--parameter-filters',
        `Key=Name,Option=Equals,Values=${name}`]).Parameters ?? []).find((p: any) => p.Name === name);
      if (!current || parameterFingerprint(current) !== fingerprint) {
        throw new Error(`Parameter version changed: ${name}`);
      }
      aws(['ssm', 'delete-parameter', '--name', name]);
    },
    removeLogGroup: async name => {
      const arn = `arn:aws:logs:${region}:${account}:log-group:${name}`;
      owned({ id: name, tags: aws(['logs', 'list-tags-for-resource', '--resource-arn', arn]).tags ?? {} }, 'Log group');
      aws(['logs', 'delete-log-group', '--log-group-name', name]);
    },
    removeQueue: async url => {
      owned({ id: url, tags: aws(['sqs', 'list-queue-tags', '--queue-url', url]).Tags ?? {} }, 'Queue');
      aws(['sqs', 'delete-queue', '--queue-url', url]);
    },
    removeTaskDefinition: async arn => {
      const record = aws(['ecs', 'describe-task-definition', '--task-definition', arn, '--include', 'TAGS',
        '--query', '{status:taskDefinition.status,tags:tags}']);
      owned({ id: arn, tags: tagsOf(record.tags) }, 'Task definition');
      if (record.status === 'ACTIVE') {
        aws(['ecs', 'deregister-task-definition', '--task-definition', arn, '--query', 'taskDefinition.status']);
        // ECS can briefly report the old state; delete requires INACTIVE, so wait rather than fail a healthy transition.
        let inactive = false;
        for (let attempt = 0; attempt < 15; attempt++) {
          if (aws(['ecs', 'describe-task-definition', '--task-definition', arn, '--query', 'taskDefinition.status']) === 'INACTIVE') {
            inactive = true; break;
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        if (!inactive) throw new Error('ECS task definition did not become INACTIVE after deregistration.');
      }
      if (record.status !== 'DELETE_IN_PROGRESS') {
        const failures = aws(['ecs', 'delete-task-definitions', '--task-definitions', arn, '--query', 'failures']);
        if (failures.length) throw new Error('ECS task-definition deletion was rejected.');
      }
    },
    // SQS documents up to 60 seconds for queue deletion; verify only after that window.
    settleQueueDeletes: async () => { await new Promise(resolve => setTimeout(resolve, 60_000)); },
  };
}
