import { fileURLToPath } from 'node:url';
import { CustomResource, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Alarm } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Rule, RuleTargetInput } from 'aws-cdk-lib/aws-events';
import { SnsTopic } from 'aws-cdk-lib/aws-events-targets';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { ITopic } from 'aws-cdk-lib/aws-sns';

export class NotificationRegistry extends Construct {
  private readonly wired = new Set<Alarm | Rule>();
  constructor(scope: Construct, id: string, private readonly topic: ITopic) { super(scope, id); }
  registerAlarm(alarm: Alarm): void {
    if (this.wired.has(alarm)) return;
    alarm.addAlarmAction(new SnsAction(this.topic)); this.wired.add(alarm);
  }
  registerEvent(rule: Rule, message: string): void {
    // Send a fixed diagnostic message rather than forwarding arbitrary potentially sensitive event payloads.
    if (this.wired.has(rule)) return;
    rule.addTarget(new SnsTopic(this.topic, { message: RuleTargetInput.fromText(message) })); this.wired.add(rule);
  }
}

export class ParameterEmailSubscription extends Construct {
  constructor(scope: Construct, id: string, props: { topic: ITopic; parameterName: string; depsLockFilePath: string }) {
    super(scope, id);
    const logs = new LogGroup(this, 'Logs', { retention: RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY });
    const fn = new NodejsFunction(this, 'Handler', { entry: fileURLToPath(new URL('./subscription.ts', import.meta.url)),
      runtime: Runtime.NODEJS_24_X, timeout: Duration.seconds(30), memorySize: 128, logGroup: logs,
      depsLockFilePath: props.depsLockFilePath, bundling: { minify: true, externalModules: [] } });
    StringParameter.fromSecureStringParameterAttributes(this, 'Email', { parameterName: props.parameterName }).grantRead(fn);
    // Unsubscribe takes a subscription ARN, but SNS authorizes this action against its parent topic.
    fn.addToRolePolicy(new PolicyStatement({ actions: ['sns:Subscribe', 'sns:ListSubscriptionsByTopic', 'sns:Unsubscribe'], resources: [props.topic.topicArn] }));
    const provider = new Provider(this, 'Provider', { onEventHandler: fn,
      logGroup: new LogGroup(this, 'ProviderLogs', { retention: RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY }) });
    new CustomResource(this, 'Subscription', { serviceToken: provider.serviceToken,
      properties: { TopicArn: props.topic.topicArn, EmailParamName: props.parameterName } });
  }
}
