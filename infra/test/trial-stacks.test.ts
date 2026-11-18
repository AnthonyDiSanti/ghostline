import { expect, it } from 'vitest';
import { assertCaptureSafe, assertGatewayReturnChanges, templateObject, TrialStacks } from '../lib/releases/trial-stacks.js';
import { writeFileSync, readFileSync } from 'node:fs';
import { getDeployment } from '../lib/config.js';
import { digest } from '../lib/releases/model.js';
import { DescribeStacksCommand, GetTemplateCommand, type CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { assertTrialTemplateUrl, capturedTrialTemplates, trialHostTemplates, type CandidateTrial } from '../lib/releases/candidates.js';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const scope = { account: '111111111111', region: 'eu-north-1', endpoint: 'GhostlineStockholmEcs' };
const url = (letter: string) => `https://ghostline-release-assets-${scope.account}-${scope.region}.s3.${scope.region}.amazonaws.com/${letter.repeat(64)}.json`;

it('captures only reconstructable infrastructure parameters and parses processed YAML', () => {
  expect(templateObject('Resources: {}\nParameters:\n  Phase:\n    Type: String\n')).toHaveProperty('Parameters.Phase.Type', 'String');
  expect(() => assertCaptureSafe({ Parameters: { Phase: { Type: 'String' } } }, { Phase: 'active' })).not.toThrow();
  expect(() => assertCaptureSafe({ Parameters: { Secret: { NoEcho: true } } }, { Secret: '****' })).toThrow('Secret');
  expect(() => templateObject('Outputs: {}')).toThrow('Incomplete');
});

it('rejects endpoint/network changes in a baseline return diff', () => {
  expect(() => assertGatewayReturnChanges([{ ResourceChange: { Action: 'Modify', ResourceType: 'AWS::ECS::Service', Replacement: 'False' } },
    { ResourceChange: { Action: 'Add', ResourceType: 'AWS::IAM::Role' } }])).not.toThrow();
  for (const ResourceType of ['AWS::EC2::EIP', 'AWS::EC2::VPC', 'AWS::EC2::SecurityGroup', 'AWS::SSM::Parameter']) {
    expect(() => assertGatewayReturnChanges([{ ResourceChange: { Action: 'Modify', ResourceType, Replacement: 'True' } }])).toThrow('boundary');
  }
  expect(() => assertGatewayReturnChanges([{ ResourceChange: { Action: 'Modify', ResourceType: 'AWS::ECS::Service', Replacement: 'Conditional' } }])).toThrow();
});

it('limits captured return templates to immutable assets in the owning regional bucket', () => {
  expect(() => assertTrialTemplateUrl(url('a'), scope)).not.toThrow();
  const regional = `https://s3.${scope.region}.amazonaws.com/ghostline-release-assets-${scope.account}-${scope.region}/${'a'.repeat(64)}.json`;
  expect(() => assertTrialTemplateUrl(regional, scope)).not.toThrow();
  for (const value of [url('a') + '?redirect=1', url('a').replace(scope.account, '222222222222'), url('a').replaceAll(scope.region, 'us-west-2'),
    'https://example.invalid/a.json', url('a').replace('a'.repeat(64), 'latest')]) expect(() => assertTrialTemplateUrl(value, scope)).toThrow();
});

it('selects captured host recipes only during the owning candidate return phase', async () => {
  const defaults = { a: url('d'), b: url('e'), addresses: url('f') };
  const trial = { ...scope, kind: 'candidate', phase: 'returning', baselineTemplates: { a: url('a'), b: url('b'), addresses: url('c') } } as CandidateTrial;
  const db = { send: async () => ({ Item: { record: { S: JSON.stringify(trial) } } }) } as unknown as Pick<DynamoDBClient, 'send'>;
  expect(await trialHostTemplates(defaults, db, 'table', scope)).toEqual(trial.baselineTemplates);
  trial.phase = 'testing';
  expect(await trialHostTemplates(defaults, db, 'table', scope)).toEqual(defaults);
  trial.phase = 'returning'; trial.region = 'us-west-2';
  expect(() => capturedTrialTemplates(trial, scope)).toThrow('scope');
  await expect(trialHostTemplates(defaults, db, 'table', scope)).rejects.toThrow('scope');
});

it('verifies captured bytes before a no-op return and accepts a completed native rollback baseline', async () => {
  const config = { ...getDeployment('stockholm-ecs'), ...scope };
  const data = JSON.stringify({ Resources: { GatewayTask: { Type: 'AWS::ECS::TaskDefinition' } } });
  const key = `${digest(data).slice(7)}.json`;
  const cfn = { send: async (command: unknown) => {
    if (command instanceof DescribeStacksCommand) return { Stacks: [{ StackName: config.stackName, StackStatus: 'UPDATE_ROLLBACK_COMPLETE',
      StackId: `arn:aws:cloudformation:${config.region}:${config.account}:stack/${config.stackName}/owned`, Parameters: [] }] };
    if (command instanceof GetTemplateCommand) return { TemplateBody: data };
    throw new Error('Unexpected mutation');
  } } as unknown as Pick<CloudFormationClient, 'send'>;
  let corrupt = false, uploaded = false;
  const stacks = new TrialStacks(config, cfn, args => {
    expect(args.slice(0, 2)).toEqual(['s3api', args[1]]);
    expect(args[args.indexOf('--bucket') + 1]).toBe(`ghostline-release-assets-${scope.account}-${scope.region}`);
    expect(args[args.indexOf('--key') + 1]).toBe(key);
    if (args[1] === 'put-object') { uploaded = readFileSync(args[args.indexOf('--body') + 1]!, 'utf8') === data; }
    else if (args[1] === 'get-object') writeFileSync(args.at(-1)!, corrupt ? '{}' : data);
    else throw new Error('Unexpected S3 mutation');
  });
  const capture = await stacks.capture(config.stackName);
  expect(uploaded).toBe(true);
  expect(stacks.template(capture)).toEqual(JSON.parse(data));
  corrupt = true;
  expect(() => stacks.template(capture)).toThrow('checksum');
});
