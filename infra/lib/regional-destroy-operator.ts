import { accountAudit } from './cloudtrail/operator.js';
import { parse as parseYaml } from 'yaml';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { getPublication, type DeploymentConfig } from './config.js';
import { captureRelease, deleteEndpointStack, releaseAfterDeletion } from './lifecycle.js';
import { lifecycleStore } from './lifecycle-operator.js';
import { claimLifecycle } from './releases/lifecycle.js';
import { persistPublication, reconcileReplication } from './releases/operator.js';
import { assertExclusiveRegionalHosts, captureDetachedEndpoint, type DestroyJournal, type DestroyPorts, type OwnedResource, type OwnedStack } from './regional-destroy.js';

function call(region: string, args: string[], missing: string[] = []): any {
  // Metadata and deletion arguments only; credentials, object contents and application parameters are never read.
  try {
    const out = execFileSync('aws', ['--profile', process.env.AWS_PROFILE ?? 'personal', '--region', region, ...args, '--output', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
    return out.trim() ? JSON.parse(out) : {};
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '');
    if (missing.some(code => stderr.includes(`(${code})`))) return undefined;
    throw new Error(`${region}: ${args[0]} ${args[1]} failed; details withheld.`);
  }
}
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const outputMap = (stack: any) => Object.fromEntries((stack.Outputs ?? []).map((o: any) => [o.OutputKey, o.OutputValue]));
const supportNames = ['GhostlineRelease', 'GhostlinePlatform', 'GhostlineReleaseAssets'];

export function regionalDestroyPorts(config: DeploymentConfig, save: (journal: DestroyJournal) => void): DestroyPorts {
  const aws = (args: string[], missing?: string[]) => call(config.region, args, missing);
  if (aws(['sts', 'get-caller-identity']).Account !== config.account) throw new Error('AWS account mismatch.');
  const currentStacks = () => aws(['cloudformation', 'describe-stacks']).Stacks as any[];
  const tagsMatch = (tags: Array<{ Key: string; Value: string }> = []) => {
    const actual = Object.fromEntries(tags.map(t => [t.Key, t.Value]));
    return Object.entries(config.globalTags).every(([k,v]) => actual[k] === v);
  };
  const assertNoReplacement = (journal: DestroyJournal) => {
    // Repeated cleanup may resume an old stack ARN, never silently retarget a new deployment with the same name.
    for (const stack of currentStacks()) if ([config.stackName, ...supportNames].includes(stack.StackName)
      && !journal.stacks.some(s => s.id === stack.StackId)) throw new Error('A regional stack was recreated after cleanup began; review before continuing.');
    const hosts = aws(['ec2','describe-instances','--filters',`Name=tag:Project,Values=${config.globalTags.Project}`,
      'Name=instance-state-name,Values=pending,running,stopping,stopped']).Reservations.flatMap((r: any) => r.Instances.map((i: any) => i.InstanceId));
    assertExclusiveRegionalHosts(journal, hosts);
  };
  const resources = (journal: DestroyJournal, type: string) => journal.stacks.flatMap(s => s.resources).filter(r => r.type === type);
  const stackPresent = (id: string) => currentStacks().find(s => s.StackId === id);
  const deleteStack = (stack: OwnedStack) => {
    const live = stackPresent(stack.id);
    if (!live) return;
    if (live.StackStatus !== 'DELETE_IN_PROGRESS') aws(['cloudformation', 'delete-stack', '--stack-name', stack.id]);
    aws(['cloudformation', 'wait', 'stack-delete-complete', '--stack-name', stack.id]);
  };
  const repoArn = (name: string) => `arn:aws:ecr:${config.region}:${config.account}:repository/${name}`;
  const checkRepo = (r: OwnedResource, journal: DestroyJournal) => {
    const repo = aws(['ecr', 'describe-repositories', '--repository-names', r.id], ['RepositoryNotFoundException'])?.repositories?.[0];
    if (!repo) return undefined;
    if (repo.repositoryArn !== repoArn(r.id)) throw new Error('Repository identity changed.');
    const rawTags = aws(['ecr', 'list-tags-for-resource', '--resource-arn', repo.repositoryArn]).tags ?? [];
    const tags = Object.fromEntries(rawTags.map((t: any) => [t.Key ?? t.key, t.Value ?? t.value]));
    const owned = Object.entries(config.globalTags).every(([k,v]) => tags[k] === v);
    const created = typeof repo.createdAt === 'number' ? repo.createdAt * 1000 : Date.parse(repo.createdAt);
    const lateReplica = !Object.keys(tags).length && created > Date.parse(journal.startedAt);
    if ((!owned && !lateReplica) || (tags['aws:cloudformation:stack-id'] && tags['aws:cloudformation:stack-id'] !== r.stackId)) {
      throw new Error(`Repository ownership is uncertain: ${r.id}`);
    }
    return repo;
  };
  return {
    save,
    inventory: async () => {
      if (aws(['sts', 'get-caller-identity']).Account !== config.account) throw new Error('AWS account mismatch.');
      const publication = getPublication();
      if (publication.retainedMembers.includes(config.region)) throw new Error('This publication region is explicitly retained; destroy is not authorized.');
      const snapshots: OwnedStack[] = [];
      let endpoint;
      const volumes: string[] = [];
      for (const stack of currentStacks().filter(s => [config.stackName, ...supportNames].includes(s.StackName))) {
        if (!tagsMatch(stack.Tags) || !stack.StackId.startsWith(`arn:aws:cloudformation:${config.region}:${config.account}:stack/${stack.StackName}/`)) throw new Error('Stack ownership mismatch.');
        if (!['CREATE_COMPLETE','UPDATE_COMPLETE','UPDATE_ROLLBACK_COMPLETE','DELETE_IN_PROGRESS','DELETE_FAILED'].includes(stack.StackStatus)) throw new Error('Regional stack is not ready for teardown.');
        const items = aws(['cloudformation','list-stack-resources','--stack-name',stack.StackId]).StackResourceSummaries;
        snapshots.push({ id: stack.StackId, name: stack.StackName, outputs: outputMap(stack), resources: items.filter((r: any) => r.PhysicalResourceId).map((r: any) => ({
          id: r.PhysicalResourceId, logicalId: r.LogicalResourceId, type: r.ResourceType, stackId: stack.StackId,
        })) });
        if (stack.StackName === config.stackName) {
          endpoint = captureRelease(config, stack, items);
          const instance = outputMap(stack).InstanceId;
          if (instance) for (const r of aws(['ec2','describe-instances','--filters',`Name=instance-id,Values=${instance}`]).Reservations) {
            for (const i of r.Instances) for (const disk of i.BlockDeviceMappings ?? []) if (disk.Ebs?.VolumeId) volumes.push(disk.Ebs.VolumeId);
          }
        }
      }
      if (!endpoint) endpoint = captureDetachedEndpoint(config, aws(['ec2','describe-addresses','--filters',
        `Name=tag:aws:cloudformation:stack-name,Values=${config.stackName}`]).Addresses);
      const journal: DestroyJournal = { schema: 1, account: config.account, region: config.region, target: config.id, owner: randomUUID(),
        startedAt: new Date().toISOString(), phase: 'inventory', stacks: snapshots, endpoint, volumes, formerMembers: publication.members, pending: [], retained: [] };
      for (const resource of snapshots.flatMap(s => s.resources)) {
        if (resource.type === 'AWS::Logs::LogGroup') {
          const group = aws(['logs','describe-log-groups','--log-group-name-prefix',resource.id]).logGroups.find((g: any) => g.logGroupName === resource.id);
          if (!group || group.retentionInDays !== 7) throw new Error('Expected existing seven-day log retention before teardown.');
          journal.retained.push({type:resource.type,id:resource.id,retention:'7 days per existing event'});
        }
        if (resource.type === 'AWS::SQS::Queue') journal.retained.push({type:resource.type,id:resource.id,retention:'up to 14 days per existing message; no producers/pollers'});
        if (resource.type === 'AWS::S3::Bucket' && resource.logicalId.startsWith('AuditLogs')) journal.retained.push({type:resource.type,id:resource.id,retention:'7 days per existing audit object'});
      }
      assertNoReplacement(journal);
      return journal;
    },
    quiesce: async journal => {
      assertNoReplacement(journal);
      const coverage = await accountAudit(config.account, config.region, 'check');
      if (!('adequate' in coverage) || !coverage.adequate) throw new Error('Verify independent shared CloudTrail coverage before deleting application audit resources.');
      // Existing stacks must first deploy log retention; applying RETAIN only to new source cannot preserve old deployed resources.
      for (const stack of journal.stacks) {
        if (!stackPresent(stack.id)) continue;
        const raw = aws(['cloudformation','get-template','--stack-name',stack.id]).TemplateBody;
        const template = typeof raw === 'string' ? parseYaml(raw) : raw;
        for (const r of stack.resources.filter(r => ['AWS::Logs::LogGroup','AWS::SQS::Queue'].includes(r.type))) {
          if (template.Resources[r.logicalId]?.DeletionPolicy !== 'Retain') throw new Error('Deploy retained expiring-log policies before regional teardown.');
        }
      }
      for (const rule of resources(journal, 'AWS::Events::Rule')) aws(['events','disable-rule','--name',rule.id], ['ResourceNotFoundException']);
      const gate = resources(journal, 'AWS::Lambda::Function').find(r => r.id === 'ghostline-prod-release-gate');
      if (gate && aws(['lambda','get-function-configuration','--function-name',gate.id], ['ResourceNotFoundException'])) {
        aws(['lambda','put-function-concurrency','--function-name',gate.id,'--reserved-concurrent-executions','0']);
        // The gate has a 60-second timeout. Disabling invocation does not cancel one already executing.
        for (let elapsed = 0; elapsed < 65; elapsed += 5) await pause(5000);
      }
      const table = resources(journal,'AWS::DynamoDB::Table').find(r => r.id === 'ghostline-prod-release-attempts');
      if (table && aws(['dynamodb','describe-table','--table-name',table.id],['ResourceNotFoundException'])) {
        const store = lifecycleStore(config); const before = await store.read();
        if (before?.operation?.kind === 'release') {
          // Only after the controller is frozen and every invocation has expired may teardown take over its claim.
          if (!await store.replace({ version: before.version + 1, mode: 'destroying', operation: { kind:'destroy',owner:journal.owner,startedAt:Date.now() } },before)) throw new Error('Lifecycle changed during freeze.');
        } else if (!await claimLifecycle(store,'destroy',journal.owner,'destroying')) throw new Error('Another CLI operation owns regional lifecycle; resume after it completes.');
      }
    },
    retireReplication: async journal => {
      const publication = getPublication();
      if (publication.retainedMembers.includes(config.region)) throw new Error('Retained publication member cannot be destroyed.');
      publication.members = publication.members.filter(r => r !== config.region);
      persistPublication(publication);
      const pending = await reconcileReplication(publication, journal.formerMembers);
      if (pending.length) return pending.map(region => `${region}: replication rules unresolved`);
      const inflight: string[] = [];
      // Removed rules do not retract already queued copies. Inspect every existing owned source manifest, not just production tags.
      for (const region of journal.formerMembers.filter(r => r !== config.region)) {
        try {
          const repos = call(region,['ecr','describe-repositories']).repositories.filter((r: any) => r.repositoryName.startsWith('ghostline/prod/'));
          for (const repo of repos) {
            const images = call(region,['ecr','list-images','--repository-name',repo.repositoryName]).imageIds;
            for (const digest of new Set<string>(images.map((i: any) => i.imageDigest))) {
              const result = call(region,['ecr','describe-image-replication-status','--repository-name',repo.repositoryName,'--image-id',`imageDigest=${digest}`]);
              for (const status of result.replicationStatuses ?? []) if (status.region === config.region && status.registryId === config.account && status.status === 'IN_PROGRESS') inflight.push(`${region}/${repo.repositoryName}/${digest}: replication in progress`);
            }
          }
        } catch { inflight.push(`${region}: inflight replication observation unavailable`); }
      }
      return inflight;
    },
    endpoint: async journal => {
      assertNoReplacement(journal);
      if (!journal.endpoint) return;
      const stack = stackPresent(journal.endpoint.stackId);
      if (stack) deleteEndpointStack(stack, args => aws(args));
      releaseAfterDeletion(config,journal.endpoint,args => {
        if (args[0] === 'cloudformation' && args[1] === 'describe-stacks' && args[3] === journal.endpoint!.stackId) {
          return aws(args, ['ValidationError']) ?? { Stacks: [] };
        }
        return aws(args);
      });
    },
    support: async journal => {
      assertNoReplacement(journal);
      // No new archives: CloudFormation drops producers/alarms/pollers while retained seven-day logs expire in place.
      for (const name of supportNames) {
        const stack = journal.stacks.find(s => s.name === name);
        if (stack) deleteStack(stack);
      }
    },
    retained: async journal => {
      assertNoReplacement(journal);
      for (const r of resources(journal,'AWS::ECR::Repository')) if (checkRepo(r,journal)) aws(['ecr','delete-repository','--repository-name',r.id,'--force']);
      for (const r of resources(journal,'AWS::DynamoDB::Table')) {
        const table = aws(['dynamodb','describe-table','--table-name',r.id],['ResourceNotFoundException'])?.Table;
        if (table) {
          const tags = aws(['dynamodb','list-tags-of-resource','--resource-arn',table.TableArn]).Tags;
          if (!tagsMatch(tags) || tags.some((t: any) => t.Key === 'aws:cloudformation:stack-id' && t.Value !== r.stackId)) throw new Error('Release table ownership mismatch.');
          aws(['dynamodb','delete-table','--table-name',r.id]); aws(['dynamodb','wait','table-not-exists','--table-name',r.id]);
        }
      }
      const assets = journal.stacks.find(s => s.name === 'GhostlineReleaseAssets');
      for (const bucket of assets?.resources.filter(r => r.type === 'AWS::S3::Bucket') ?? []) {
        const existing = aws(['s3api','list-buckets']).Buckets.some((b: any) => b.Name === bucket.id);
        if (!existing) continue;
        const tags = aws(['s3api','get-bucket-tagging','--bucket',bucket.id,'--expected-bucket-owner',config.account]).TagSet;
        if (!tagsMatch(tags) || tags.some((t: any) => t.Key === 'aws:cloudformation:stack-id' && t.Value !== bucket.stackId)) throw new Error('Asset bucket ownership mismatch.');
        const objects = aws(['s3api','list-object-versions','--bucket',bucket.id,'--expected-bucket-owner',config.account]);
        const versions = [...(objects.Versions ?? []), ...(objects.DeleteMarkers ?? [])].map((v: any) => ({Key:v.Key,VersionId:v.VersionId}));
        for (let start = 0; start < versions.length; start += 1000) {
          const removed = aws(['s3api','delete-objects','--bucket',bucket.id,'--expected-bucket-owner',config.account,'--delete',JSON.stringify({Objects:versions.slice(start,start+1000),Quiet:true})]);
          if (removed.Errors?.length) throw new Error('Some exclusively owned asset objects remain.');
        }
        for (const upload of aws(['s3api','list-multipart-uploads','--bucket',bucket.id,'--expected-bucket-owner',config.account]).Uploads ?? []) {
          aws(['s3api','abort-multipart-upload','--bucket',bucket.id,'--key',upload.Key,'--upload-id',upload.UploadId,'--expected-bucket-owner',config.account]);
        }
        aws(['s3api','delete-bucket','--bucket',bucket.id,'--expected-bucket-owner',config.account]);
      }
    },
    verify: async journal => {
      assertNoReplacement(journal);
      const pending: string[] = [];
      for (const stack of journal.stacks) if (stackPresent(stack.id)) pending.push(`stack:${stack.id}`);
      for (const volume of journal.volumes) if (aws(['ec2','describe-volumes','--filters',`Name=volume-id,Values=${volume}`]).Volumes.length) pending.push(`volume:${volume}`);
      for (const r of resources(journal,'AWS::ECR::Repository')) if (checkRepo(r,journal)) pending.push(`repository:${r.id}`);
      for (const r of resources(journal,'AWS::DynamoDB::Table')) if (aws(['dynamodb','describe-table','--table-name',r.id],['ResourceNotFoundException'])) pending.push(`table:${r.id}`);
      for (const allocation of journal.endpoint?.allocations ?? []) if (aws(['ec2','describe-addresses','--filters',`Name=allocation-id,Values=${allocation}`]).Addresses.length) pending.push(`eip:${allocation}`);
      // A later retry will catch delayed repository recreation. This evidence does not claim shared security or expiring bytes cost zero.
      return pending;
    },
  };
}
