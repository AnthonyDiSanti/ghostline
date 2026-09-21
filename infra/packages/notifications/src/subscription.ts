import { createHash } from 'node:crypto';
import { SNSClient, ListSubscriptionsByTopicCommand, SubscribeCommand, UnsubscribeCommand } from '@aws-sdk/client-sns';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

interface Event {
  RequestType: 'Create' | 'Update' | 'Delete';
  PhysicalResourceId?: string;
  ResourceProperties: { TopicArn: string; EmailParamName: string };
}
const identity = (topic: string, email: string) => createHash('sha256').update(`${topic}/${email.toLowerCase().trim()}`).digest('hex');

export function createHandler(ssm = new SSMClient({}), sns = new SNSClient({})) {
  return async (event: Event) => {
    const { TopicArn, EmailParamName } = event.ResourceProperties;
    const subscriptions = [];
    let NextToken: string | undefined;
    do {
      const page = await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn, NextToken }));
      subscriptions.push(...(page.Subscriptions ?? [])); NextToken = page.NextToken;
    } while (NextToken);
    // Deletion uses the opaque identity and works after the parameter has already been removed.
    if (event.RequestType === 'Delete') {
      for (const sub of subscriptions) if (sub.Endpoint && identity(TopicArn, sub.Endpoint) === event.PhysicalResourceId
        && sub.SubscriptionArn?.startsWith('arn:')) await sns.send(new UnsubscribeCommand({ SubscriptionArn: sub.SubscriptionArn }));
      return { PhysicalResourceId: event.PhysicalResourceId };
    }
    const parameter = await ssm.send(new GetParameterCommand({ Name: EmailParamName, WithDecryption: true }));
    const email = parameter.Parameter?.Value?.trim().toLowerCase();
    if (parameter.Parameter?.Type !== 'SecureString' || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid alert email parameter.');
    const id = identity(TopicArn, email);
    // Pending confirmations are subscriptions too; avoid sending a new request on every stack update.
    if (!subscriptions.some(sub => sub.Protocol === 'email' && sub.Endpoint?.trim().toLowerCase() === email)) {
      await sns.send(new SubscribeCommand({ TopicArn, Protocol: 'email', Endpoint: email }));
    }
    return { PhysicalResourceId: id };
  };
}
export const handler = createHandler();
