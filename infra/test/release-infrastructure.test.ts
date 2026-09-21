import { afterAll, expect, it } from 'vitest';
import { App, Tags } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { RegionalReleaseStack } from '../lib/releases/stack.js';
afterAll(() => CloudAssembly.cleanupTemporaryDirectories());

it('keeps the regional gate restricted to manifest reads, attempt state, alerts and one service update', () => {
  const app = new App();
  const stack = new RegionalReleaseStack(app, 'ReleaseTest', { env: { account: '000000000000', region: 'eu-north-1' },
    gateway: 'test-gateway', automation: true });
  Tags.of(stack).add('Project', 'ghostline'); Tags.of(stack).add('Environment', 'prod'); Tags.of(stack).add('System', 'shared');
  const template = Template.fromStack(stack);
  const resources = template.toJSON().Resources as Record<string, any>;
  const gate = Object.values(resources).find(r => r.Type === 'AWS::Lambda::Function' && r.Properties.FunctionName === 'ghostline-prod-release-gate');
  expect(gate.Properties.ReservedConcurrentExecutions).toBe(1);
  expect(gate.Properties.Environment.Variables.AUTOMATION).toBe('enabled');
  const policy = Object.entries(resources).find(([id, r]) => id.startsWith('GateServiceRoleDefaultPolicy') && r.Type === 'AWS::IAM::Policy')![1];
  const statements = policy.Properties.PolicyDocument.Statement;
  const actions = statements.flatMap((s: any) => [s.Action].flat());
  for (const action of ['ecr:PutImage', 'ecs:RegisterTaskDefinition', 'ecs:DeregisterTaskDefinition', 'ssm:GetParameter', 'iam:PassRole', 'cloudformation:UpdateStack']) {
    expect(actions).not.toContain(action);
  }
  expect(statements.find((s: any) => [s.Action].flat().includes('ecs:UpdateService')).Resource)
    .toEqual({ 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':ecs:eu-north-1:000000000000:service/test-gateway/test-gateway-gateway']] });
  expect(Object.values(resources).filter(r => r.Type === 'AWS::Events::Rule' && r.Properties.ScheduleExpression).map(r => r.Properties.ScheduleExpression)).toEqual(['rate(1 hour)']);
  template.resourceCountIs('AWS::DynamoDB::Table', 1);
  template.resourceCountIs('AWS::ECR::Repository', 3);
  template.resourceCountIs('AWS::EC2::Instance', 0);
  template.resourceCountIs('AWS::ECS::TaskDefinition', 0);
  template.hasResourceProperties('AWS::CloudTrail::Trail', { IsLogging: true, IsMultiRegionTrail: false,
    IncludeGlobalServiceEvents: false, EnableLogFileValidation: true,
    EventSelectors: [{ IncludeManagementEvents: true, ReadWriteType: 'WriteOnly' }] });
  template.hasResourceProperties('AWS::S3::Bucket', { LifecycleConfiguration: { Rules: [{ ExpirationInDays: 7, Status: 'Enabled' }] } });
  expect(JSON.stringify(resources)).not.toContain('/pa/');
});

it('does not create a gateway or deployment controller in publisher-only regions', () => {
  const app = new App();
  const stack = new RegionalReleaseStack(app, 'Publisher', { env: { account: '000000000000', region: 'us-east-1' }, automation: true });
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::ECR::Repository', 3);
  for (const type of ['AWS::Lambda::Function', 'AWS::EC2::Instance', 'AWS::DynamoDB::Table', 'AWS::CloudTrail::Trail']) template.resourceCountIs(type, 0);
});
