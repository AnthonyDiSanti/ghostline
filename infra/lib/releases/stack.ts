import { fileURLToPath } from 'node:url';
import { CfnOutput, CliCredentialsStackSynthesizer, Duration, LegacyStackSynthesizer, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { NotificationRegistry, ParameterEmailSubscription } from '@ghostline/aws-notifications';
import { artifacts, lifecyclePolicy, repository, type Artifact } from './model.js';

export const releaseStackName = 'GhostlineRelease';
export const gateName = 'ghostline-prod-release-gate';
export const tableName = 'ghostline-prod-release-attempts';
export const emailParameter = '/ghostline/prod/alerts/email';
export const assetStackName = 'GhostlineReleaseAssets';
export const assetBucketName = (account: string, region: string) => `ghostline-release-assets-${account}-${region}`;

export class ReleaseAssetsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, { ...props, synthesizer: new LegacyStackSynthesizer() });
    // Lambda ZIP assets need regional storage, without introducing administrator deployment roles.
    new s3.Bucket(this, 'Assets', { bucketName: assetBucketName(this.account, this.region),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true, objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED, removalPolicy: RemovalPolicy.RETAIN });
  }
}

export class ImageDistribution extends Construct {
  readonly repositories: Record<Artifact, ecr.IRepository>;
  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.repositories = Object.fromEntries(artifacts.map(name => {
      const repo = new ecr.Repository(this, name, { repositoryName: repository(name), removalPolicy: RemovalPolicy.RETAIN, emptyOnDelete: false });
      const resource = repo.node.defaultChild as ecr.CfnRepository;
      resource.imageTagMutability = 'IMMUTABLE_WITH_EXCLUSION';
      // ECR allows at most five exclusion filters; one explicit keep namespace covers our movable aliases.
      resource.imageTagMutabilityExclusionFilters = [{ imageTagMutabilityExclusionFilterType: 'WILDCARD', imageTagMutabilityExclusionFilterValue: 'keep-*' }];
      resource.lifecyclePolicy = { lifecyclePolicyText: JSON.stringify(lifecyclePolicy(name)) };
      Tags.of(repo).add('System', name === 'awg' ? 'amneziawg' : name === 'xray' ? 'xray' : 'shared');
      new CfnOutput(Stack.of(this), `${name}Repository`, { value: repo.repositoryUri });
      return [name, repo];
    })) as Record<Artifact, ecr.Repository>;
  }
}

export class RegionalReleaseStack extends Stack {
  readonly repositories: Record<Artifact, ecr.IRepository>;
  constructor(scope: Construct, id: string, props: StackProps & { gateway?: string; automation: boolean }) {
    super(scope, id, { ...props, synthesizer: props.gateway ? new CliCredentialsStackSynthesizer({
      fileAssetsBucketName: assetBucketName(props.env!.account!, props.env!.region!),
    }) : new LegacyStackSynthesizer() });
    this.repositories = new ImageDistribution(this, 'Images').repositories;
    // Publisher-only regions have repositories, but no compute gateway or deployment handler.
    if (!props.gateway) return;
    const cluster = props.gateway;
    const service = `${cluster}-gateway`;
    const clusterArn = this.formatArn({ service: 'ecs', resource: 'cluster', resourceName: cluster });
    const serviceArn = this.formatArn({ service: 'ecs', resource: 'service', resourceName: `${cluster}/${service}` });
    const table = new dynamodb.Table(this, 'Attempts', { tableName, partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, removalPolicy: RemovalPolicy.RETAIN });
    const topic = new sns.Topic(this, 'Alerts', { topicName: 'ghostline-prod-release-alerts', enforceSSL: true });
    const notifications = new NotificationRegistry(this, 'Notifications', topic);
    const lock = fileURLToPath(new URL('../../package-lock.json', import.meta.url));
    new ParameterEmailSubscription(this, 'Email', { topic, parameterName: emailParameter, depsLockFilePath: lock });
    const deadLetters = new sqs.Queue(this, 'FailedEvents', { retentionPeriod: Duration.days(14), enforceSSL: true });
    const handler = new NodejsFunction(this, 'Gate', { functionName: gateName,
      entry: fileURLToPath(new URL('../../lambda/release-gate.ts', import.meta.url)), depsLockFilePath: lock,
      runtime: lambda.Runtime.NODEJS_24_X, architecture: lambda.Architecture.ARM_64, memorySize: 256,
      timeout: Duration.seconds(60), reservedConcurrentExecutions: 1, retryAttempts: 0,
      deadLetterQueue: deadLetters, logGroup: new logs.LogGroup(this, 'Logs', { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY }),
      bundling: { minify: true, externalModules: [] },
      environment: { ACCOUNT: this.account, CLUSTER: cluster, SERVICE: service, TABLE: table.tableName,
        TOPIC: topic.topicArn, AUTOMATION: props.automation ? 'enabled' : 'disabled' } });
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ecr:BatchGetImage'], resources: Object.values(this.repositories).map(r => r.repositoryArn) }));
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:GetItem', 'dynamodb:PutItem'], resources: [table.tableArn] }));
    topic.grantPublish(handler);
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ecs:DescribeServices', 'ecs:ListServiceDeployments', 'ecs:UpdateService'], resources: [serviceArn] }));
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ecs:ListTasks'], resources: ['*'], conditions: { ArnEquals: { 'ecs:cluster': clusterArn } } }));
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ecs:DescribeTasks'], resources: [this.formatArn({ service: 'ecs', resource: 'task', resourceName: `${cluster}/*` })] }));
    // A regional event is only a wakeup; hourly state reconciliation repairs missed or differently shaped notifications.
    const target = new targets.LambdaFunction(handler, { deadLetterQueue: deadLetters, retryAttempts: 2, maxEventAge: Duration.hours(1) });
    new events.Rule(this, 'Arrivals', { enabled: props.automation, eventPattern: { source: ['aws.ecr'] }, targets: [target] });
    new events.Rule(this, 'Hourly', { enabled: props.automation, schedule: events.Schedule.rate(Duration.hours(1)), targets: [target] });
    const failed = new events.Rule(this, 'DeploymentFailure', { eventPattern: { source: ['aws.ecs'], detailType: ['ECS Deployment State Change'],
      resources: [serviceArn], detail: { eventName: ['SERVICE_DEPLOYMENT_FAILED'] } }, targets: [target] });
    notifications.registerEvent(failed, `${cluster}: ECS deployment failed or is rolling back. Inspect the regional release status.`);
    // CloudTrail-backed EventBridge rules require a logging trail; the default event history is insufficient.
    const auditBucket = new s3.Bucket(this, 'AuditLogs', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true, objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [{ expiration: Duration.days(7) }], removalPolicy: RemovalPolicy.RETAIN });
    new cloudtrail.Trail(this, 'TaskAudit', { trailName: 'ghostline-prod-release-audit', bucket: auditBucket,
      isMultiRegionTrail: false, includeGlobalServiceEvents: false, managementEvents: cloudtrail.ReadWriteType.WRITE_ONLY,
      enableFileValidation: true, sendToCloudWatchLogs: false });
    // CDK's trail grants the service principal access; restrict those grants to this exact regional trail.
    auditBucket.addToResourcePolicy(new iam.PolicyStatement({ effect: iam.Effect.DENY,
      principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')], actions: ['s3:GetBucketAcl', 's3:PutObject'],
      resources: [auditBucket.bucketArn, auditBucket.arnForObjects('*')], conditions: { ArnNotEquals: {
        'aws:SourceArn': this.formatArn({ service: 'cloudtrail', resource: 'trail', resourceName: 'ghostline-prod-release-audit' }),
      } } }));
    const changed = new events.Rule(this, 'TaskDefinitionChanged', { eventPattern: { source: ['aws.ecs'], detailType: ['AWS API Call via CloudTrail'],
      detail: { eventSource: ['ecs.amazonaws.com'], eventName: ['RegisterTaskDefinition'], requestParameters: { family: [service] } } } });
    notifications.registerEvent(changed, `${cluster}: a gateway task-definition revision was registered. This is expected only during an IaC change.`);
    const selected = new events.Rule(this, 'TaskSelectionChanged', { eventPattern: { source: ['aws.ecs'], detailType: ['AWS API Call via CloudTrail'],
      detail: { eventSource: ['ecs.amazonaws.com'], eventName: ['UpdateService'], requestParameters: { service: [service, serviceArn], taskDefinition: [{ exists: true }] } } } });
    notifications.registerEvent(selected, `${cluster}: the service task-definition selection changed. Review this infrastructure change.`);
    notifications.registerAlarm(handler.metricErrors({ period: Duration.minutes(5) }).createAlarm(this, 'GateErrors', { threshold: 1, evaluationPeriods: 1 }));
    notifications.registerAlarm(deadLetters.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }).createAlarm(this, 'UndeliveredEvents', { threshold: 1, evaluationPeriods: 1 }));
    new CfnOutput(this, 'GateFunction', { value: handler.functionName });
    new CfnOutput(this, 'AlertTopic', { value: topic.topicArn });
    new CfnOutput(this, 'AttemptTable', { value: table.tableName });
  }
}
