import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { EventBridgeClient, EnableRuleCommand, DisableRuleCommand } from '@aws-sdk/client-eventbridge';

export interface ReleaseStateConfig { table: string; topic: string; cluster: string; progressRule: string }
export interface ReleaseStateClients {
  db: Pick<DynamoDBClient, 'send'>; sns: Pick<SNSClient, 'send'>; events: Pick<EventBridgeClient, 'send'>;
}
export class ReleaseState {
  constructor(readonly config: ReleaseStateConfig, readonly clients: ReleaseStateClients) {}
  now() { return Date.now(); }
  async record<T>(id: string): Promise<T | undefined> {
    const value = await this.clients.db.send(new GetItemCommand({ TableName: this.config.table, Key: { id: { S: id } }, ConsistentRead: true }));
    return value.Item?.record?.S ? JSON.parse(value.Item.record.S) as T : undefined;
  }
  async put(id: string, record: unknown): Promise<void> {
    // Only the durable lifecycle owner writes unversioned observations and notification receipts.
    await this.clients.db.send(new PutItemCommand({ TableName: this.config.table,
      Item: { id: { S: id }, record: { S: JSON.stringify(record) } } }));
  }
  async replace<T extends { version: number }>(id: string, next: T, previous?: T): Promise<boolean> {
    // Per-record CAS protects against a stale actor even when its earlier lifecycle ownership looked valid.
    try {
      await this.clients.db.send(new PutItemCommand({ TableName: this.config.table,
        Item: { id: { S: id }, version: { N: String(next.version) }, record: { S: JSON.stringify(next) } },
        ConditionExpression: previous ? '#v = :v' : 'attribute_not_exists(id)',
        ...(previous ? { ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':v': { N: String(previous.version) } } } : {}) }));
      return true;
    } catch (error) { if ((error as Error).name === 'ConditionalCheckFailedException') return false; throw error; }
  }
  async progress(enabled: boolean): Promise<void> {
    // Continuation is minute-based only while a bounded action is pending; idle reconciliation remains hourly.
    const Command = enabled ? EnableRuleCommand : DisableRuleCommand;
    await this.clients.events.send(new Command({ Name: this.config.progressRule }));
  }
  async alert(key: string, reason: string): Promise<void> {
    if (await this.record(`alert/${key}`)) return;
    await this.clients.sns.send(new PublishCommand({ TopicArn: this.config.topic,
      Subject: 'Ghostline regional release needs attention', Message: `${this.config.cluster}: ${reason}` }));
    await this.put(`alert/${key}`, { at: this.now() });
  }
}
