import { afterAll, expect, it } from 'vitest';
import { App, Tags } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { getDeployment } from '../lib/config.js';
import { RegionalReleaseStack } from '../lib/releases/stack.js';
afterAll(() => CloudAssembly.cleanupTemporaryDirectories());

// This integration check runs two real esbuild bundles; allow CPU contention from parallel synth tests.
it('limits whole-stack effects to owned services, exact tagged host and a fixed read-only observation document', { timeout: 15_000 }, () => {
  const app = new App({ context: { '@aws-cdk/core:explicitStackTags': true } });
  const stack = new RegionalReleaseStack(app, 'ReleaseTest', { env: { account: '000000000000', region: 'eu-north-1' },
    tags: { Project: 'ghostline', Environment: 'prod', System: 'shared' },
    deployment: { ...getDeployment('stockholm-ecs'), account: '000000000000', resourceName: 'test-gateway', stackName: 'TestEndpoint' }, guardDuty: true, automation: true });
  Tags.of(stack).add('Project', 'ghostline'); Tags.of(stack).add('Environment', 'prod'); Tags.of(stack).add('System', 'shared');
  const template = Template.fromStack(stack);
  const resources = template.toJSON().Resources as Record<string, any>;
  expect(app.synth().getStackArtifact(stack.artifactId).tags).toMatchObject({ Project: 'ghostline', Environment: 'prod', System: 'shared' });
  const gate = Object.values(resources).find(r => r.Type === 'AWS::Lambda::Function' && r.Properties.FunctionName === 'ghostline-prod-release-gate');
  expect(gate.Properties.ReservedConcurrentExecutions).toBe(1);
  expect(gate.Properties.Environment.Variables.AUTOMATION).toBe('enabled');
  expect(gate.Properties.Environment.Variables.LIFECYCLE_SCHEMA).toBe('1');
  const hook = Object.values(resources).find(r => r.Type === 'AWS::Lambda::Function' && r.Properties.FunctionName === 'ghostline-prod-deployment-hook');
  expect(hook.Properties.ReservedConcurrentExecutions).toBe(4);
  const hookPolicy = Object.entries(resources).find(([id, r]) => id.startsWith('DeploymentHookServiceRoleDefaultPolicy') && r.Type === 'AWS::IAM::Policy')![1];
  const hookStatements = hookPolicy.Properties.PolicyDocument.Statement;
  expect(hookStatements.flatMap((s: any) => [s.Action].flat()).filter((a: string) => !a.startsWith('logs:'))).toEqual(['lambda:InvokeFunction']);
  expect(hookStatements.find((s: any) => s.Action === 'lambda:InvokeFunction').Resource).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Gate/), 'Arn'] });
  for (const resource of Object.values(resources).filter(r => ['AWS::Logs::LogGroup', 'AWS::SQS::Queue'].includes(r.Type))) {
    expect(resource.DeletionPolicy).toBe('Retain');
  }
  const policy = Object.entries(resources).find(([id, r]) => id.startsWith('GateServiceRoleDefaultPolicy') && r.Type === 'AWS::IAM::Policy')![1];
  const statements = policy.Properties.PolicyDocument.Statement;
  const actions = statements.flatMap((s: any) => [s.Action].flat());
  for (const action of ['ecr:PutImage', 'ecs:RegisterTaskDefinition', 'ecs:DeregisterTaskDefinition', 'ssm:GetParameter']) {
    expect(actions).not.toContain(action);
  }
  expect(statements.find((s: any) => [s.Action].flat().includes('ecs:UpdateService')).Resource)
    .toEqual({ 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':ecs:eu-north-1:000000000000:service/test-gateway/test-gateway-gateway']] });
  const schedules = Object.values(resources).filter(r => r.Type === 'AWS::Events::Rule' && r.Properties.ScheduleExpression);
  expect(schedules.map(r => r.Properties.ScheduleExpression)).toEqual(['rate(1 minute)', 'rate(1 hour)']);
  expect(schedules[0].Properties.State).toBe('DISABLED');
  expect(actions).not.toContain('ec2:RebootInstances');
  expect(statements.find((s: any) => [s.Action].flat().includes('ecs:DeregisterContainerInstance')).Resource)
    .toEqual([
      { 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':ecs:eu-north-1:000000000000:cluster/test-gateway']] },
      { 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':ecs:eu-north-1:000000000000:container-instance/test-gateway/*']] },
    ]);
  const hostRead = statements.find((s: any) => [s.Action].flat().includes('ssm:SendCommand') && s.Condition);
  expect(hostRead.Condition.StringEquals).toEqual({ 'aws:ResourceTag/Project': 'ghostline', 'aws:ResourceTag/Environment': 'prod',
    'aws:ResourceTag/aws:cloudformation:stack-name': ['TestEndpoint-Host-a', 'TestEndpoint-Host-b'] });
  const observe = Object.values(resources).find(r => r.Type === 'AWS::SSM::Document')!;
  expect(observe.Properties.Content.parameters).toBeUndefined();
  expect(observe.Properties.Content.mainSteps).toHaveLength(1);
  expect(observe.Properties.Content.mainSteps[0].inputs.runCommand[0]).toContain('apiclient get os');
  expect(JSON.stringify(statements)).not.toContain('AWS-RunShellScript');
  expect(actions).not.toContain('ssm:ListCommands');
  expect(actions).not.toContain('ssm:UpdateDocument');
  expect(actions).not.toContain('ec2:StopInstances');
  // Full account read auditing must not make manifest reads wake their own controller.
  const ecrRules = Object.values(resources).filter(r => r.Type === 'AWS::Events::Rule' && r.Properties.EventPattern?.source?.includes('aws.ecr'));
  expect(ecrRules).toHaveLength(2);
  expect(ecrRules.map(r => r.Properties.EventPattern['detail-type'])).toEqual([
    ['ECR Image Action', 'ECR Replication Action'], ['AWS API Call via CloudTrail'],
  ]);
  expect(ecrRules[1].Properties.EventPattern.detail.eventName).toEqual(['PutImage']);
  template.resourceCountIs('AWS::DynamoDB::Table', 1);
  template.resourceCountIs('AWS::ECR::Repository', 6);
  template.resourceCountIs('AWS::EC2::Instance', 0);
  template.resourceCountIs('AWS::ECS::TaskDefinition', 0);
  // Destroying this application must never remove account audit coverage or its destination.
  template.resourceCountIs('AWS::CloudTrail::Trail', 0);
  template.resourceCountIs('AWS::S3::Bucket', 0);
  expect(JSON.stringify(resources)).not.toContain('/pa/');
});

it('does not create a gateway or deployment controller in publisher-only regions', () => {
  const app = new App();
  const stack = new RegionalReleaseStack(app, 'Publisher', { env: { account: '000000000000', region: 'us-east-1' }, automation: true,
    tags: { Project: 'ghostline', Environment: 'prod', System: 'shared' } });
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::ECR::Repository', 6);
  for (const type of ['AWS::Lambda::Function', 'AWS::EC2::Instance', 'AWS::DynamoDB::Table', 'AWS::CloudTrail::Trail']) template.resourceCountIs(type, 0);
});
