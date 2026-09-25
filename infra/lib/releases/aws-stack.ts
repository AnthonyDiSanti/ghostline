import { CloudFormationClient, DescribeStackResourceCommand } from '@aws-sdk/client-cloudformation';
import { EC2Client, DescribeInstancesCommand, RebootInstancesCommand } from '@aws-sdk/client-ec2';
import { ECSClient, ListContainerInstancesCommand, DescribeContainerInstancesCommand, UpdateContainerInstancesStateCommand, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { EventBridgeClient, EnableRuleCommand, DisableRuleCommand } from '@aws-sdk/client-eventbridge';
import { parseHostObservation, type HostObservation } from '../platform-observation.js';
import { artifacts, repository } from './model.js';
import { readiness } from './gate.js';
import { runtimeManifest, type Registry } from './registry.js';
import { observeEcsService } from './ecs-observation.js';
import type { LifecycleMode } from './lifecycle.js';
import type { ActionObservation, StackAttempt, StackPorts, Step } from './stack-reconcile.js';

export interface StackGateConfig {
  stack: string; cluster: string; service: string; daemon: string; table: string; topic: string;
  observerDocument: string; progressRule: string;
}
export interface StackClients {
  cfn: Pick<CloudFormationClient, 'send'>; ec2: Pick<EC2Client, 'send'>; ecs: Pick<ECSClient, 'send'>;
  db: Pick<DynamoDBClient, 'send'>; ssm: Pick<SSMClient, 'send'>; sns: Pick<SNSClient, 'send'>; events: Pick<EventBridgeClient, 'send'>;
}
interface Probe { host: string; command: string; requestedAt: number }
export class AwsStackGate implements StackPorts {
  private current?: ActionObservation;
  private containerInstance?: string;
  constructor(readonly registry: Registry, readonly config: StackGateConfig, readonly clients: StackClients,
    private readonly mode: LifecycleMode) {}
  now() { return Date.now(); }
  async record<T>(id: string): Promise<T | undefined> {
    const value = await this.clients.db.send(new GetItemCommand({ TableName: this.config.table, Key: { id: { S: id } }, ConsistentRead: true }));
    return value.Item?.record?.S ? JSON.parse(value.Item.record.S) as T : undefined;
  }
  async put(id: string, record: unknown): Promise<void> {
    // Callers hold the durable lifecycle claim; conditional writes additionally protect action progression.
    await this.clients.db.send(new PutItemCommand({ TableName: this.config.table, Item: { id: { S: id }, record: { S: JSON.stringify(record) } } }));
  }
  async attempt() { return this.record<StackAttempt>('stack/current'); }
  async save(next: StackAttempt, previous?: StackAttempt): Promise<boolean> {
    try {
      await this.clients.db.send(new PutItemCommand({ TableName: this.config.table,
        Item: { id: { S: 'stack/current' }, version: { N: String(next.version) }, record: { S: JSON.stringify(next) } },
        ConditionExpression: previous ? '#v = :v' : 'attribute_not_exists(id)',
        ...(previous ? { ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':v': { N: String(previous.version) } } } : {}) }));
      return true;
    } catch (error) { if ((error as Error).name === 'ConditionalCheckFailedException') return false; throw error; }
  }
  async progress(enabled: boolean): Promise<void> {
    // One regional continuation rule is enabled only while an observation/action is pending, never for idle reconciliation.
    const Command = enabled ? EnableRuleCommand : DisableRuleCommand;
    await this.clients.events.send(new Command({ Name: this.config.progressRule }));
  }
  async exactHost(): Promise<string | undefined> {
    try {
      const result = await this.clients.cfn.send(new DescribeStackResourceCommand({ StackName: this.config.stack, LogicalResourceId: 'Instance' }));
      const resource = result.StackResourceDetail;
      if (resource?.ResourceStatus === 'DELETE_COMPLETE') return undefined;
      if (resource?.ResourceType !== 'AWS::EC2::Instance' || !/^i-[a-f0-9]{17}$/.test(resource.PhysicalResourceId ?? '')) throw new Error('Invalid exact host ownership.');
      return resource.PhysicalResourceId;
    } catch (error) {
      // Only CloudFormation's explicit missing-stack/resource response means a parked/absent host.
      if ((error as Error).name === 'ValidationError' && /does not exist|does not exist for stack/.test((error as Error).message)) return undefined;
      throw error;
    }
  }
  private async hostProbe(host: string): Promise<HostObservation | undefined> {
    const previous = await this.record<Probe>('host/probe');
    if (previous?.host === host && this.now() - previous.requestedAt < 120_000) {
      const response = await this.clients.ssm.send(new GetCommandInvocationCommand({ CommandId: previous.command, InstanceId: host }))
        .catch(error => { if (error.name === 'InvocationDoesNotExist') return undefined; throw error; });
      if (response?.Status === 'Success') {
        if (response.DocumentName !== this.config.observerDocument) throw new Error('Unexpected host observation document.');
        return parseHostObservation(response.StandardOutputContent ?? '');
      }
      if (!response || ['Pending', 'InProgress', 'Delayed'].includes(response.Status ?? '')) return undefined;
      await this.alert(`host-probe/${host}`, 'Fixed host observation failed; no host mutation was requested.');
      return undefined;
    }
    // This is a parameterless, read-only document. Lost acknowledgements can safely repeat observation, never administration.
    const response = await this.clients.ssm.send(new SendCommandCommand({ DocumentName: this.config.observerDocument,
      InstanceIds: [host], TimeoutSeconds: 30, Comment: 'Ghostline fixed nonsecret host observation' }));
    if (!response.Command?.CommandId) throw new Error('Host observation command identity is missing.');
    await this.put('host/probe', { host, command: response.Command.CommandId, requestedAt: this.now() } satisfies Probe);
    return undefined;
  }
  async refresh(): Promise<'ready' | 'pending'> {
    // The first observation resolves the owned host before any command or lifecycle effect.
    const host = await this.exactHost();
    if (!host || this.mode !== 'active') { this.current = { mode: this.mode }; return 'ready'; }
    const instances = (await this.clients.ec2.send(new DescribeInstancesCommand({ InstanceIds: [host] }))).Reservations?.flatMap(r => r.Instances ?? []) ?? [];
    if (instances.length !== 1 || instances[0]!.InstanceId !== host) throw new Error('Exact host observation failed.');
    const state = instances[0]!.State?.Name;
    if (!state) throw new Error('Host power state is unavailable.');
    const arns = new Set<string>();
    for (const status of ['ACTIVE', 'DRAINING'] as const) {
      let nextToken: string | undefined;
      do {
        const page: { containerInstanceArns?: string[]; nextToken?: string } = await this.clients.ecs.send(new ListContainerInstancesCommand({ cluster: this.config.cluster, status, nextToken }));
        page.containerInstanceArns?.forEach(arn => arns.add(arn)); nextToken = page.nextToken;
      } while (nextToken);
    }
    const registered = arns.size ? await this.clients.ecs.send(new DescribeContainerInstancesCommand({ cluster: this.config.cluster, containerInstances: [...arns] })) : undefined;
    if (registered?.failures?.length || (registered?.containerInstances?.length ?? 0) > 1
      || registered?.containerInstances?.some(i => i.ec2InstanceId !== host)) throw new Error('Unexpected ECS host registration.');
    const container = registered?.containerInstances?.[0];
    this.containerInstance = container?.containerInstanceArn;
    const [gateway, daemon] = await Promise.all([
      observeEcsService(this.clients.ecs, this.config.cluster, this.config.service, 'gateway'),
      observeEcsService(this.clients.ecs, this.config.cluster, this.config.daemon, 'daemon'),
    ]);
    const probe = state === 'running' && container?.agentConnected ? await this.hostProbe(host) : undefined;
    this.current = { mode: this.mode, host: { id: host, state, agentConnected: container?.agentConnected ?? false,
      registration: container?.status === 'DRAINING' ? 'DRAINING' : 'ACTIVE', ...(probe ?? {}) },
      bootstrap: probe?.bootstrap, gateway, daemon: daemon ? { ...daemon, digest: daemon.images['network-daemon'] } : undefined };
    if (state === 'running' && container?.agentConnected && !probe) return 'pending';
    const resolved: Record<string, string> = {};
    for (const name of artifacts) {
      const observed = name === 'bootstrap' ? probe?.bootstrap?.digest : name === 'network-daemon' ? this.current.daemon?.digest : gateway?.images[name];
      if (!observed) continue;
      const image = await this.registry.get(repository(name), observed);
      if (image) resolved[observed] = (await runtimeManifest(this.registry, repository(name), image)).digest;
    }
    this.current.resolvedDigests = resolved;
    // Raw runtime references survive stop/park for operator retention decisions; aliases are never substituted for them.
    if (probe?.bootstrap && gateway?.stable && daemon?.stable) await this.put('host/observed', { at: this.now(), observation: this.current });
    return 'ready';
  }
  async observe(): Promise<ActionObservation> {
    if (!this.current) throw new Error('Refresh regional observations first.');
    return this.current;
  }
  async stillReady(release: string): Promise<boolean> {
    const ready = await readiness(this.registry);
    return ready.ready && ready.current?.digest === release;
  }
  async request(step: Exclude<Step, 'verify' | 'daemon-ready'>, host: string): Promise<void> {
    // Recheck CloudFormation ownership immediately before every effect; never follow a stale instance ID across a rebuild.
    if (await this.exactHost() !== host) throw new Error('Exact host changed before action.');
    if (step === 'reboot') {
      await this.clients.ec2.send(new RebootInstancesCommand({ InstanceIds: [host] })); return;
    }
    if (step === 'drain' || step === 'activate') {
      if (!this.containerInstance) throw new Error('No exact container instance for lifecycle action.');
      await this.clients.ecs.send(new UpdateContainerInstancesStateCommand({ cluster: this.config.cluster,
        containerInstances: [this.containerInstance], status: step === 'drain' ? 'DRAINING' : 'ACTIVE' })); return;
    }
    // Definitions remain entirely CDK-owned. Only desired power and force deployment are controller effects.
    await this.clients.ecs.send(new UpdateServiceCommand({ cluster: this.config.cluster,
      service: step === 'daemon' || step === 'daemon-cold' ? this.config.daemon : this.config.service,
      ...(step === 'quiesce' ? { desiredCount: 0 } : step === 'restore' ? { desiredCount: 1 }
        : { forceNewDeployment: true, ...(step === 'gateway' ? { desiredCount: 1 } : {}) }) }));
  }
  async alert(key: string, reason: string): Promise<void> {
    if (await this.record(`alert/${key}`)) return;
    await this.clients.sns.send(new PublishCommand({ TopicArn: this.config.topic, Subject: 'Ghostline regional release needs attention', Message: `${this.config.cluster}: ${reason}` }));
    await this.put(`alert/${key}`, { at: this.now() });
  }
}
