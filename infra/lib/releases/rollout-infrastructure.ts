import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Stack } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import type { DeploymentConfig } from '../config.js';
import { hostTemplates } from '../host-slot.js';
import { slotProvisionerName } from '../host-slot-authority.js';
import { hostSlots, slotStackName, transitionAddressStackName } from '../host-slot-model.js';

export function rolloutInfrastructure(stack: Stack, handler: IFunction, config: DeploymentConfig, guardDuty: boolean) {
  // Host templates use the same regional CDK file-asset publication as Lambda code, never Docker image assets.
  const folder = mkdtempSync(join(tmpdir(), 'ghostline-slot-templates-'));
  const templates = hostTemplates(config, guardDuty);
  const urls = Object.fromEntries(Object.entries(templates).map(([name, value]) => {
    const file = join(folder, `${name}.json`); writeFileSync(file, value);
    const asset = new Asset(stack, `HostTemplate${name}`, { path: file });
    asset.grantRead(handler);
    return [name, asset.httpUrl];
  }));
  rmSync(folder, { recursive: true }); // Asset construction stages each immutable file into the assembly before returning.
  const stackNames = [...hostSlots.map(slot => slotStackName(config.stackName, slot)), transitionAddressStackName(config.stackName)];
  const stackArns = stackNames.map(name => stack.formatArn({ service: 'cloudformation', resource: 'stack', resourceName: `${name}/*` }));
  const roleArn = stack.formatArn({ service: 'iam', region: '', resource: 'role', resourceName: slotProvisionerName(config.resourceName) });
  const add = (props: ConstructorParameters<typeof PolicyStatement>[0]) => handler.addToRolePolicy(new PolicyStatement(props));
  add({ actions: ['cloudformation:CreateStack', 'cloudformation:UpdateStack'], resources: stackArns,
    // StringEquals (not IfExists) disallows TemplateBody/UsePreviousTemplate and an arbitrary administrator execution role.
    conditions: { StringEquals: { 'cloudformation:TemplateUrl': Object.values(urls), 'cloudformation:RoleArn': roleArn } } });
  add({ actions: ['cloudformation:DeleteStack'], resources: [stackArns[2]!],
    conditions: { StringEquals: { 'cloudformation:RoleArn': roleArn } } });
  add({ actions: ['cloudformation:DescribeStacks', 'cloudformation:ListStackResources'], resources: [...stackArns,
    stack.formatArn({ service: 'cloudformation', resource: 'stack', resourceName: `${config.stackName}/*` })] });
  add({ actions: ['iam:PassRole'], resources: [roleArn], conditions: { StringEquals: { 'iam:PassedToService': 'cloudformation.amazonaws.com' } } });
  const deployment = stack.formatArn({ service: 'ecs', resource: 'service-deployment', resourceName: `${config.resourceName}/${config.resourceName}-gateway/*` });
  add({ actions: ['ecs:DescribeServiceDeployments', 'ecs:StopServiceDeployment'], resources: [deployment] });
  // ECS authorizes both deployment operations against the owning service, not only the supplied service-deployment ARN (native trial evidence).
  add({ actions: ['ecs:DescribeServiceDeployments', 'ecs:StopServiceDeployment'], resources: [stack.formatArn({ service: 'ecs', resource: 'service', resourceName: `${config.resourceName}/${config.resourceName}-gateway` })] });
  add({ actions: ['ecs:PutAttributes'], resources: [stack.formatArn({ service: 'ecs', resource: 'container-instance', resourceName: `${config.resourceName}/*` })] });
  const tags = { 'aws:ResourceTag/Project': config.globalTags.Project!, 'aws:ResourceTag/Environment': config.globalTags.Environment!,
    'aws:ResourceTag/aws:cloudformation:stack-name': [config.stackName, ...stackNames] };
  // Both the allocation and ENI must be ours. Code rechecks the exact stack IDs/private addresses immediately before mutation.
  add({ actions: ['ec2:AssociateAddress', 'ec2:DisassociateAddress'], resources: ['elastic-ip', 'network-interface'].map(resource =>
    stack.formatArn({ service: 'ec2', resource, resourceName: '*' })), conditions: { StringEquals: tags } });
  add({ actions: ['ec2:DescribeAddresses', 'ec2:DescribeNetworkInterfaces'], resources: ['*'] });
  return { templates: JSON.stringify(urls), role: roleArn, tags: JSON.stringify({ ...config.globalTags, System: 'shared' }) };
}
