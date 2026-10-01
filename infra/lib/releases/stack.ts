import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
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
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { NotificationRegistry, ParameterEmailSubscription } from '@ghostline/aws-notifications';
import { repositoryArtifacts, lifecyclePolicy, repository, type RepositoryArtifact } from './model.js';
import { imageArrivalPattern, imageAliasPattern } from './events.js';

import { gateName, hookName, tableName, emailParameter, observerDocumentName, progressRuleName, assetBucketName } from './names.js';
export * from './names.js';
import { rolloutInfrastructure } from './rollout-infrastructure.js';
import { hostSlots, slotStackName, daemonServiceName } from '../host-slot-model.js';
import type { DeploymentConfig } from '../config.js';

export class ReleaseAssetsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { tags: Record<string, string> }) {
    super(scope, id, { ...props, synthesizer: new LegacyStackSynthesizer() });
    // Lambda ZIP assets need regional storage, without introducing administrator deployment roles.
    new s3.Bucket(this, 'Assets', { bucketName: assetBucketName(this.account, this.region),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true, objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED, removalPolicy: RemovalPolicy.RETAIN });
  }
}

export class ImageDistribution extends Construct {
  readonly repositories: Record<RepositoryArtifact, ecr.IRepository>;
  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.repositories = Object.fromEntries(repositoryArtifacts.map(name => {
      const repo = new ecr.Repository(this, name, { repositoryName: repository(name), removalPolicy: RemovalPolicy.RETAIN, emptyOnDelete: false });
      const resource = repo.node.defaultChild as ecr.CfnRepository;
      resource.imageTagMutability = 'IMMUTABLE_WITH_EXCLUSION';
      // ECR allows at most five exclusion filters; one explicit keep namespace covers our movable aliases.
      resource.imageTagMutabilityExclusionFilters = [{ imageTagMutabilityExclusionFilterType: 'WILDCARD', imageTagMutabilityExclusionFilterValue: 'keep-*' }];
      resource.lifecyclePolicy = { lifecyclePolicyText: JSON.stringify(lifecyclePolicy(name)) };
      Tags.of(repo).add('System', name === 'awg' ? 'amneziawg' : name === 'xray' ? 'xray' : 'shared');
      new CfnOutput(Stack.of(this), `${name}Repository`, { value: repo.repositoryUri });
      return [name, repo];
    })) as Record<RepositoryArtifact, ecr.Repository>;
  }
}

export class RegionalReleaseStack extends Stack {
  readonly repositories: Record<RepositoryArtifact, ecr.IRepository>;
  constructor(scope: Construct, id: string, props: StackProps & { deployment?: DeploymentConfig; guardDuty?: boolean; automation: boolean; tags: Record<string, string> }) {
    super(scope, id, { ...props, synthesizer: props.deployment ? new CliCredentialsStackSynthesizer({
      fileAssetsBucketName: assetBucketName(props.env!.account!, props.env!.region!),
    }) : new LegacyStackSynthesizer() });
    this.repositories = new ImageDistribution(this, 'Images').repositories;
    // Publisher-only regions have repositories, but no compute gateway or deployment handler.
    if (!props.deployment) return;
    if (props.guardDuty === undefined) throw new Error('Host templates require explicit GuardDuty capability discovery.');
    const config = props.deployment;
    const cluster = config.resourceName;
    const service = `${cluster}-gateway`;
    const daemons = hostSlots.map(slot => daemonServiceName(cluster, slot));
    const clusterArn = this.formatArn({ service: 'ecs', resource: 'cluster', resourceName: cluster });
    const serviceArn = this.formatArn({ service: 'ecs', resource: 'service', resourceName: `${cluster}/${service}` });
    const daemonArns = daemons.map(daemon => this.formatArn({ service: 'ecs', resource: 'service', resourceName: `${cluster}/${daemon}` }));
    const observer = new ssm.CfnDocument(this, 'HostObserver', { name: observerDocumentName, documentType: 'Command',
      updateMethod: 'NewVersion', content: { schemaVersion: '2.2', description: 'Fixed nonsecret Ghostline host observation',
        mainSteps: [{ action: 'aws:runShellScript', name: 'Observe', inputs: { timeoutSeconds: '25',
          runCommand: [readFileSync(new URL('../../../runtime/ecs/bottlerocket/observe-host.sh', import.meta.url), 'utf8')] } }] } });
    const table = new dynamodb.Table(this, 'Attempts', { tableName, partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, removalPolicy: RemovalPolicy.RETAIN });
    const topic = new sns.Topic(this, 'Alerts', { topicName: 'ghostline-prod-release-alerts', enforceSSL: true });
    const notifications = new NotificationRegistry(this, 'Notifications', topic);
    const lock = fileURLToPath(new URL('../../package-lock.json', import.meta.url));
    new ParameterEmailSubscription(this, 'Email', { topic, parameterName: emailParameter, depsLockFilePath: lock });
    const deadLetters = new sqs.Queue(this, 'FailedEvents', { retentionPeriod: Duration.days(14), enforceSSL: true, removalPolicy: RemovalPolicy.RETAIN });
    const handler = new NodejsFunction(this, 'Gate', { functionName: gateName,
      entry: fileURLToPath(new URL('../../lambda/release-gate.ts', import.meta.url)), depsLockFilePath: lock,
      runtime: lambda.Runtime.NODEJS_24_X, architecture: lambda.Architecture.ARM_64, memorySize: 256,
      timeout: Duration.seconds(60), reservedConcurrentExecutions: 1, retryAttempts: 0,
      deadLetterQueue: deadLetters, logGroup: new logs.LogGroup(this, 'Logs', { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.RETAIN }),
      bundling: { minify: true, externalModules: [] },
      environment: { ACCOUNT: this.account, CLUSTER: cluster, SERVICE: service, TABLE: table.tableName,
        TOPIC: topic.topicArn, ENDPOINT_STACK: config.stackName,
        OBSERVER_DOCUMENT: observer.ref, PROGRESS_RULE: progressRuleName,
        LIFECYCLE_SCHEMA: '1', AUTOMATION: props.automation ? 'enabled' : 'disabled' } });
    const rollout = rolloutInfrastructure(this, handler, config, props.guardDuty);
    handler.addEnvironment('SLOT_TEMPLATES', rollout.templates);
    handler.addEnvironment('SLOT_ROLE', rollout.role);
    handler.addEnvironment('OWNER_TAGS', rollout.tags);
    // ECS treats a direct Lambda 429 as hook failure. A separate receiver waits while the sole mutation controller is busy.
    const hook = new NodejsFunction(this, 'DeploymentHook', { functionName: hookName,
      entry: fileURLToPath(new URL('../../lambda/deployment-hook.ts', import.meta.url)), depsLockFilePath: lock,
      runtime: lambda.Runtime.NODEJS_24_X, architecture: lambda.Architecture.ARM_64, memorySize: 128,
      timeout: Duration.seconds(75), reservedConcurrentExecutions: 4, retryAttempts: 0,
      logGroup: new logs.LogGroup(this, 'HookLogs', { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.RETAIN }),
      bundling: { minify: true, externalModules: [] },
      environment: { CONTROLLER: handler.functionArn, SERVICE: serviceArn } });
    hook.addToRolePolicy(new iam.PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [handler.functionArn] }));
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ecr:BatchGetImage'], resources: Object.values(this.repositories).map(r => r.repositoryArn) }));
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:GetItem', 'dynamodb:PutItem'], resources: [table.tableArn] }));
    topic.grantPublish(handler);
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ecs:DescribeServices', 'ecs:ListServiceDeployments', 'ecs:UpdateService'], resources: [serviceArn] }));
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ecs:ListTasks'], resources: ['*'], conditions: { ArnEquals: { 'ecs:cluster': clusterArn } } }));
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ecs:DescribeTasks'], resources: [this.formatArn({ service: 'ecs', resource: 'task', resourceName: `${cluster}/*` })] }));
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ecs:ListContainerInstances'], resources: [clusterArn] }));
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ecs:DescribeContainerInstances', 'ecs:UpdateContainerInstancesState'],
      resources: [this.formatArn({ service: 'ecs', resource: 'container-instance', resourceName: `${cluster}/*` })] }));
    // Deregistration authorizes both the enclosing cluster and its container instance; neither scope may escape this endpoint.
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ecs:DeregisterContainerInstance'],
      resources: [clusterArn, this.formatArn({ service: 'ecs', resource: 'container-instance', resourceName: `${cluster}/*` })] }));
    // Exact physical identity is rechecked in code; immutable CloudFormation owner tags constrain replacement-host authority.
    const hostArn = this.formatArn({ service: 'ec2', resource: 'instance', resourceName: '*' });
    const hostTags = { 'aws:ResourceTag/Project': props.tags.Project!, 'aws:ResourceTag/Environment': props.tags.Environment!,
      'aws:ResourceTag/aws:cloudformation:stack-name': hostSlots.map(slot => slotStackName(config.stackName, slot)) };
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ssm:SendCommand'],
      resources: [this.formatArn({ service: 'ssm', resource: 'document', resourceName: observer.ref })] }));
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ssm:SendCommand'], resources: [hostArn], conditions: { StringEquals: hostTags } }));
    // AWS offers no resource-level scope for these reads. No command listing, arbitrary document or parameter access is granted.
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['ec2:DescribeInstances', 'ssm:GetCommandInvocation'], resources: ['*'] }));
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['events:EnableRule', 'events:DisableRule'],
      resources: [this.formatArn({ service: 'events', resource: 'rule', resourceName: progressRuleName })] }));
    // A regional event is only a wakeup; hourly state reconciliation repairs missed or differently shaped notifications.
    const target = new targets.LambdaFunction(handler, { deadLetterQueue: deadLetters, retryAttempts: 2, maxEventAge: Duration.hours(1) });
    // This is continuation of an accepted action/observation, not minute-by-minute release reconciliation while idle.
    new events.Rule(this, 'Progress', { ruleName: progressRuleName, enabled: false,
      schedule: events.Schedule.rate(Duration.minutes(1)), targets: [target] });
    new events.Rule(this, 'Arrivals', { enabled: props.automation, eventPattern: imageArrivalPattern, targets: [target] });
    new events.Rule(this, 'AliasUpdated', { enabled: props.automation, eventPattern: imageAliasPattern, targets: [target] });
    new events.Rule(this, 'Hourly', { enabled: props.automation, schedule: events.Schedule.rate(Duration.hours(1)), targets: [target] });
    new events.Rule(this, 'DeploymentCompleted', { eventPattern: { source: ['aws.ecs'], detailType: ['ECS Deployment State Change'],
      resources: [serviceArn, ...daemonArns], detail: { eventName: ['SERVICE_DEPLOYMENT_COMPLETED'] } }, targets: [target] });
    const failed = new events.Rule(this, 'DeploymentFailure', { eventPattern: { source: ['aws.ecs'], detailType: ['ECS Deployment State Change'],
      resources: [serviceArn, ...daemonArns], detail: { eventName: ['SERVICE_DEPLOYMENT_FAILED'] } }, targets: [target] });
    notifications.registerEvent(failed, `${cluster}: ECS deployment failed or is rolling back. Inspect the regional release status.`);
    // Deployment verifies independent account-trail coverage; regional alert rules do not own its lifecycle.
    const changed = new events.Rule(this, 'TaskDefinitionChanged', { eventPattern: { source: ['aws.ecs'], detailType: ['AWS API Call via CloudTrail'],
      detail: { eventSource: ['ecs.amazonaws.com'], eventName: ['RegisterTaskDefinition'], requestParameters: { family: [service, ...daemons] } } } });
    notifications.registerEvent(changed, `${cluster}: a gateway task-definition revision was registered. This is expected only during an IaC change.`);
    const selected = new events.Rule(this, 'TaskSelectionChanged', { eventPattern: { source: ['aws.ecs'], detailType: ['AWS API Call via CloudTrail'],
      detail: { eventSource: ['ecs.amazonaws.com'], eventName: ['UpdateService'], requestParameters: { service: [service, serviceArn, ...daemons, ...daemonArns], taskDefinition: [{ exists: true }] } } } });
    notifications.registerEvent(selected, `${cluster}: the service task-definition selection changed. Review this infrastructure change.`);
    notifications.registerAlarm(handler.metricErrors({ period: Duration.minutes(5) }).createAlarm(this, 'GateErrors', { threshold: 1, evaluationPeriods: 1 }));
    notifications.registerAlarm(deadLetters.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }).createAlarm(this, 'UndeliveredEvents', { threshold: 1, evaluationPeriods: 1 }));
    new CfnOutput(this, 'GateFunction', { value: handler.functionName });
    new CfnOutput(this, 'AlertTopic', { value: topic.topicArn });
    new CfnOutput(this, 'AttemptTable', { value: table.tableName });
  }
}
