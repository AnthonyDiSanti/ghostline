import { Stack } from 'aws-cdk-lib';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import type { DeploymentConfig } from './config.js';
import { daemonServiceName, hostSlots, slotStackName, transitionAddressStackName } from './host-slot-model.js';

export const slotProvisionerName = (family: string) => `${family}-slot-provisioner`;
export function hostSlotAuthority(stack: Stack, config: DeploymentConfig,
  coordinates: { subnet: string; security: string; hostRole: string; executionRole: string }): Role {
  // Only CloudFormation executes the reviewed host templates. The regional Lambda never gets task-definition or user-data authority.
  const role = new Role(stack, 'SlotProvisioner', { roleName: slotProvisionerName(config.resourceName),
    assumedBy: new ServicePrincipal('cloudformation.amazonaws.com') });
  const ec2 = (kind: string, id = '*') => `arn:aws:ec2:${config.region}:${config.account}:${kind}/${id}`;
  const ecs = (kind: string, id: string) => `arn:aws:ecs:${config.region}:${config.account}:${kind}/${id}`;
  const tags = { 'aws:ResourceTag/Project': config.globalTags.Project!, 'aws:ResourceTag/Environment': config.globalTags.Environment!,
    'aws:ResourceTag/aws:cloudformation:stack-name': [...hostSlots.map(s => slotStackName(config.stackName, s)), transitionAddressStackName(config.stackName)] };
  role.addToPolicy(new PolicyStatement({ actions: ['ec2:DescribeInstances', 'ec2:DescribeInstanceStatus', 'ec2:DescribeNetworkInterfaces',
    'ec2:DescribeLaunchTemplates', 'ec2:DescribeLaunchTemplateVersions', 'ec2:DescribeImages', 'ec2:DescribeSubnets', 'ec2:DescribeSecurityGroups',
    'ec2:DescribeVolumes', 'ec2:DescribeAddresses', 'ec2:DescribeTags', 'ec2:DescribeVpcs', 'ec2:DescribeInstanceCreditSpecifications', 'ec2:DescribeIamInstanceProfileAssociations'], resources: ['*'] }));
  role.addToPolicy(new PolicyStatement({ actions: ['ec2:DescribeInstanceAttribute'], resources: [ec2('instance')],
    conditions: { StringEquals: tags } }));
  const newResources = [ec2('instance'), ec2('volume'), ec2('network-interface'), ec2('launch-template'), ec2('elastic-ip')];
  role.addToPolicy(new PolicyStatement({ actions: ['ec2:CreateTags'], resources: newResources,
    conditions: { StringEquals: { 'aws:RequestTag/Project': config.globalTags.Project!, 'aws:RequestTag/Environment': config.globalTags.Environment! } } }));
  // Updates may send only changed tags, without repeating Project/Environment request tags. Existing ownership must authorize them.
  role.addToPolicy(new PolicyStatement({ actions: ['ec2:CreateTags', 'ec2:DeleteTags'], resources: newResources.filter(arn => arn !== ec2('launch-template')), conditions: { StringEquals: tags } }));
  // CloudFormation reapplies the declared address/group properties even during a tag-only interface update.
  role.addToPolicy(new PolicyStatement({ actions: ['ec2:AssignPrivateIpAddresses', 'ec2:UnassignPrivateIpAddresses', 'ec2:ModifyNetworkInterfaceAttribute'],
    resources: [ec2('network-interface')], conditions: { StringEquals: tags } }));
  // These setters support the declared credit/device attributes during EC2 resource stabilization, within the same owned slots.
  role.addToPolicy(new PolicyStatement({ actions: ['ec2:ModifyInstanceCreditSpecification', 'ec2:ModifyInstanceAttribute'],
    resources: [ec2('instance')], conditions: { StringEquals: tags } }));
  role.addToPolicy(new PolicyStatement({ actions: ['ec2:CreateNetworkInterface'], resources: [ec2('subnet', coordinates.subnet), ec2('security-group', coordinates.security)] }));
  role.addToPolicy(new PolicyStatement({ actions: ['ec2:CreateNetworkInterface', 'ec2:CreateLaunchTemplate', 'ec2:AllocateAddress'],
    resources: [ec2('network-interface'), ec2('launch-template'), ec2('elastic-ip')],
    conditions: { StringEquals: { 'aws:RequestTag/Project': config.globalTags.Project!, 'aws:RequestTag/Environment': config.globalTags.Environment! } } }));
  role.addToPolicy(new PolicyStatement({ actions: ['ec2:RunInstances'], resources: [ec2('instance'), ec2('volume')],
    conditions: { StringEquals: { 'aws:RequestTag/Project': config.globalTags.Project!, 'aws:RequestTag/Environment': config.globalTags.Environment! } } }));
  role.addToPolicy(new PolicyStatement({ actions: ['ec2:RunInstances'], resources: [ec2('subnet', coordinates.subnet), ec2('security-group', coordinates.security),
    `arn:aws:ec2:${config.region}::image/*`] }));
  role.addToPolicy(new PolicyStatement({ actions: ['ec2:RunInstances'], resources: [ec2('network-interface')], conditions: { StringEquals: tags } }));
  role.addToPolicy(new PolicyStatement({ actions: ['ec2:TerminateInstances', 'ec2:DeleteNetworkInterface', 'ec2:ReleaseAddress'],
    resources: newResources.filter(arn => arn !== ec2('launch-template')), conditions: { StringEquals: tags } }));
  // EC2 launch templates do not receive reserved CloudFormation tags; use our explicit slot ownership tag for this resource type.
  role.addToPolicy(new PolicyStatement({ actions: ['ec2:RunInstances', 'ec2:CreateTags', 'ec2:DeleteTags', 'ec2:DeleteLaunchTemplate'],
    resources: [ec2('launch-template')], conditions: { StringEquals: {
      'aws:ResourceTag/Project': config.globalTags.Project!, 'aws:ResourceTag/Environment': config.globalTags.Environment!,
      'aws:ResourceTag/GhostlineHostStack': hostSlots.map(slot => slotStackName(config.stackName, slot)),
    } } }));
  role.addToPolicy(new PolicyStatement({ actions: ['iam:PassRole'], resources: [coordinates.hostRole], conditions: { StringEquals: { 'iam:PassedToService': 'ec2.amazonaws.com' } } }));
  role.addToPolicy(new PolicyStatement({ actions: ['iam:PassRole'], resources: [coordinates.executionRole], conditions: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } } }));
  role.addToPolicy(new PolicyStatement({ actions: ['ssm:GetParameters'], resources: [`arn:aws:ssm:${config.region}::parameter/aws/service/bottlerocket/aws-ecs-3/arm64/*/image_id`] }));
  role.addToPolicy(new PolicyStatement({ actions: ['iam:GetRole'], resources: [coordinates.executionRole] }));
  const families = hostSlots.map(slot => daemonServiceName(config.resourceName, slot));
  role.addToPolicy(new PolicyStatement({ actions: ['ecs:RegisterTaskDefinition', 'ecs:TagResource', 'ecs:UntagResource', 'ecs:ListTagsForResource'],
    resources: families.map(f => ecs('task-definition', `${f}:*`)) }));
  // ECS does not support resource-level IAM for these two task-definition APIs. Restrict the CFN-only role to this region.
  role.addToPolicy(new PolicyStatement({ actions: ['ecs:DeregisterTaskDefinition', 'ecs:DescribeTaskDefinition'], resources: ['*'],
    conditions: { StringEquals: { 'aws:RequestedRegion': config.region } } }));
  role.addToPolicy(new PolicyStatement({ actions: ['ecs:CreateService', 'ecs:UpdateService', 'ecs:DeleteService', 'ecs:DescribeServices', 'ecs:TagResource', 'ecs:UntagResource', 'ecs:ListTagsForResource'],
    resources: families.map(f => ecs('service', `${config.resourceName}/${f}`)) }));
  // The native service provider reads deployment history during stabilization; authority remains limited to the two daemon services.
  role.addToPolicy(new PolicyStatement({ actions: ['ecs:ListServiceDeployments', 'ecs:DescribeServiceDeployments'],
    resources: families.map(f => ecs('service', `${config.resourceName}/${f}`)) }));
  role.addToPolicy(new PolicyStatement({ actions: ['ecs:DescribeServiceDeployments'],
    resources: families.map(f => ecs('service-deployment', `${config.resourceName}/${f}/*`)) }));
  return role;
}
