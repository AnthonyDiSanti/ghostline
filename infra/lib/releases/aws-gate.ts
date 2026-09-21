import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { ECSClient, DescribeServicesCommand, ListTasksCommand, DescribeTasksCommand,
  ListServiceDeploymentsCommand, UpdateServiceCommand } from '@aws-sdk/client-ecs';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { artifacts, type Artifact } from './model.js';
import { type Attempt, type GatePorts, type ServiceSnapshot } from './gate.js';
import type { Registry } from './registry.js';

export interface GateConfig { cluster: string; service: string; table: string; topic: string }
export class AwsGate implements GatePorts {
  constructor(readonly registry: Registry, readonly config: GateConfig,
    private readonly ecs: ECSClient, private readonly db: DynamoDBClient, private readonly sns: SNSClient) {}
  now() { return Date.now(); }

  async service(): Promise<ServiceSnapshot | undefined> {
    // Read only the configured service. An absent/parked endpoint is never a request to create or scale it.
    const result = await this.ecs.send(new DescribeServicesCommand({ cluster: this.config.cluster, services: [this.config.service] }))
      .catch(error => { if (error.name === 'ClusterNotFoundException') return { services: [] }; throw error; });
    if ('failures' in result && result.failures?.some(f => f.reason !== 'MISSING')) throw new Error('ECS service lookup failed.');
    const service = result.services?.[0];
    if (!service || service.status !== 'ACTIVE') return undefined;
    if (!service.createdAt) throw new Error('Missing service incarnation.');
    const deployments: ServiceSnapshot['deployments'] = [];
    let nextToken: string | undefined;
    do {
      const page = await this.ecs.send(new ListServiceDeploymentsCommand({ cluster: this.config.cluster,
        service: this.config.service, maxResults: 100, nextToken }));
      for (const d of page.serviceDeployments ?? []) {
        if (!d.serviceDeploymentArn || !d.createdAt || !d.status) throw new Error('Incomplete ECS deployment metadata.');
        deployments.push({ id: d.serviceDeploymentArn, status: d.status, createdAt: d.createdAt.getTime() });
      }
      nextToken = page.nextToken;
    } while (nextToken);
    const tasks = await this.ecs.send(new ListTasksCommand({ cluster: this.config.cluster, serviceName: this.config.service, desiredStatus: 'RUNNING' }));
    const images: Partial<Record<Artifact, string>> = {};
    if (tasks.taskArns?.length === 1) {
      const details = await this.ecs.send(new DescribeTasksCommand({ cluster: this.config.cluster, tasks: tasks.taskArns }));
      if (details.failures?.length) throw new Error('ECS task lookup failed.');
      for (const container of details.tasks?.[0]?.containers ?? []) {
        if (artifacts.includes(container.name as Artifact) && container.imageDigest) images[container.name as Artifact] = container.imageDigest;
      }
    }
    const busy = (service.deployments ?? []).some(d => d.rolloutState === 'IN_PROGRESS') || (service.deployments?.length ?? 0) > 1;
    return { incarnation: `${service.serviceArn}/${service.createdAt.toISOString()}`, desired: service.desiredCount ?? 0,
      stable: !busy && service.runningCount === service.desiredCount && service.pendingCount === 0 && tasks.taskArns?.length === 1,
      busy, images, deployments };
  }

  async attempt(release: string): Promise<Attempt | undefined> {
    const response = await this.db.send(new GetItemCommand({ TableName: this.config.table,
      Key: { id: { S: `release/${release}` } }, ConsistentRead: true }));
    return response.Item?.record?.S ? JSON.parse(response.Item.record.S) as Attempt : undefined;
  }

  async save(next: Attempt, previous?: Attempt): Promise<boolean> {
    // Conditional writes remain necessary even with Lambda concurrency one: operator calls can overlap.
    try {
      await this.db.send(new PutItemCommand({ TableName: this.config.table,
        Item: { id: { S: `release/${next.release}` }, version: { N: String(next.version) }, record: { S: JSON.stringify(next) } },
        ConditionExpression: previous ? '#v = :v' : 'attribute_not_exists(id)',
        ...(previous ? { ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':v': { N: String(previous.version) } } } : {}) }));
      return true;
    } catch (error) { if ((error as Error).name === 'ConditionalCheckFailedException') return false; throw error; }
  }

  async force(): Promise<void> {
    // Keep this exact request shape: IaC owns task definitions, desired count and every other service option.
    await this.ecs.send(new UpdateServiceCommand({ cluster: this.config.cluster, service: this.config.service, forceNewDeployment: true }));
  }

  async alert(key: string, message: string): Promise<void> {
    const id = `alert/${key}`;
    const existing = await this.db.send(new GetItemCommand({ TableName: this.config.table, Key: { id: { S: id } }, ConsistentRead: true }));
    if (existing.Item) return;
    await this.sns.send(new PublishCommand({ TopicArn: this.config.topic, Subject: 'Ghostline regional release needs attention',
      Message: `${this.config.cluster}: ${message}` }));
    // Record only after delivery acceptance. A crash can duplicate an alert, never silently suppress it.
    await this.db.send(new PutItemCommand({ TableName: this.config.table, Item: { id: { S: id }, sentAt: { N: String(this.now()) } } }));
  }
}
