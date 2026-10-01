import { App, CfnCondition, CfnOutput, CfnParameter, Fn, LegacyStackSynthesizer, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import { CfnInstance, CfnLaunchTemplate, CfnNetworkInterface, CfnEIP } from 'aws-cdk-lib/aws-ec2';
import { CfnService, CfnTaskDefinition } from 'aws-cdk-lib/aws-ecs';
import type { Construct } from 'constructs';
import { gatewayPlatform, slotAddresses, daemonServiceName, networkTaskDefinition, type HostSlot } from './gateway-platform.js';
import type { DeploymentConfig } from './config.js';
import cdkConfig from '../cdk.json' with { type: 'json' };

import { slotStackName, transitionAddressStackName } from './host-slot-model.js';
export { slotStackName, transitionAddressStackName, type SlotPhase } from './host-slot-model.js';

export class HostSlotStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { deployment: DeploymentConfig; slot: HostSlot; guardDuty: boolean }) {
    super(scope, id, { ...props, synthesizer: new LegacyStackSynthesizer() });
    const { deployment: config, slot } = props;
    // The controller submits only this CDK-owned template. Phase changes do not give it arbitrary user-data authority.
    const phase = new CfnParameter(this, 'Phase', { type: 'String', default: 'absent', allowedValues: ['absent', 'network-only', 'running'] });
    const os = new CfnParameter(this, 'OsVersion', { type: 'String', allowedPattern: '[0-9]+\\.[0-9]+\\.[0-9]+' });
    const subnet = new CfnParameter(this, 'SubnetId', { type: 'AWS::EC2::Subnet::Id' });
    const security = new CfnParameter(this, 'SecurityGroupId', { type: 'AWS::EC2::SecurityGroup::Id' });
    const profile = new CfnParameter(this, 'InstanceProfileName', { type: 'String', allowedPattern: '[A-Za-z0-9+=,.@_-]+' });
    const execution = new CfnParameter(this, 'NetworkExecutionRoleArn', { type: 'String',
      allowedPattern: `arn:aws:iam::${config.account}:role/[A-Za-z0-9+=,.@_/-]+` });
    const hasNetwork = new CfnCondition(this, 'HasNetwork', { expression: Fn.conditionNot(Fn.conditionEquals(phase.valueAsString, 'absent')) });
    const running = new CfnCondition(this, 'IsRunning', { expression: Fn.conditionEquals(phase.valueAsString, 'running') });
    const addresses = slotAddresses(slot);
    const platform = gatewayPlatform(config, props.guardDuty, slot);
    const nic = new CfnNetworkInterface(this, 'NetworkInterface', { subnetId: subnet.valueAsString, groupSet: [security.valueAsString],
      privateIpAddresses: [{ privateIpAddress: addresses.awg, primary: true }, { privateIpAddress: addresses.xray, primary: false }] });
    nic.cfnOptions.condition = hasNetwork;
    // Version-specific public channel preserves regional AMI mapping without selecting a newer unqualified OS at launch.
    const template = new CfnLaunchTemplate(this, 'HostLaunchTemplate', {
      // Launch templates need explicit resource TagSpecifications; the generic CDK tag aspect does not populate them.
      tagSpecifications: [{ resourceType: 'launch-template', tags: Object.entries({ ...config.globalTags, System: 'shared', GhostlineHostStack: slotStackName(config.stackName, slot) }).map(([key, value]) => ({ key, value })) }],
      launchTemplateData: {
      imageId: Fn.join('', ['resolve:ssm:/aws/service/bottlerocket/aws-ecs-3/arm64/', os.valueAsString, '/image_id']),
    } });
    template.cfnOptions.condition = running;
    const instance = new CfnInstance(this, 'Instance', { instanceType: config.instanceType,
      iamInstanceProfile: profile.valueAsString, networkInterfaces: [{ deviceIndex: '0', networkInterfaceId: nic.ref }],
      launchTemplate: { launchTemplateId: template.ref, version: template.attrLatestVersionNumber },
      metadataOptions: { httpTokens: 'required', httpPutResponseHopLimit: 1 }, blockDeviceMappings: platform.disks,
      propagateTagsToVolumeOnCreation: true, creditSpecification: { cpuCredits: 'unlimited' }, userData: Fn.base64(platform.userData) });
    instance.cfnOptions.condition = running;
    Tags.of(instance).add('Name', `${config.resourceName}-${slot}`);
    if (props.guardDuty) Tags.of(instance).add('GuardDutyManaged', 'true');
    const task = new CfnTaskDefinition(this, 'NetworkTask', networkTaskDefinition(config, platform.daemonImage, execution.valueAsString, slot));
    task.cfnOptions.condition = running;
    const daemon = new CfnService(this, 'NetworkService', { cluster: config.resourceName,
      serviceName: daemonServiceName(config.resourceName, slot), taskDefinition: task.ref,
      launchType: 'EC2', schedulingStrategy: 'DAEMON', propagateTags: 'TASK_DEFINITION',
      placementConstraints: [{ type: 'memberOf', expression: `attribute:ghostline_slot == ${slot}` }],
      deploymentConfiguration: { minimumHealthyPercent: 0, maximumPercent: 100 } });
    daemon.cfnOptions.condition = running;
    // Network-only teardown waits for daemon removal and host termination before the controller detaches any management EIP.
    daemon.addResourceDependency(instance);
    new CfnOutput(this, 'NetworkInterfaceId', { value: nic.ref, condition: hasNetwork });
    new CfnOutput(this, 'InstanceId', { value: instance.ref, condition: running });
    new CfnOutput(this, 'NetworkDaemonServiceName', { value: daemon.attrName, condition: running });
  }
}

export class TransitionAddressStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, { ...props, synthesizer: new LegacyStackSynthesizer() });
    // A single transient pair can move between slots; neither host stack owns the other's management connectivity.
    for (const protocol of ['xray', 'awg']) {
      const address = new CfnEIP(this, `${protocol}Address`, { domain: 'vpc' });
      Tags.of(address).add('System', protocol === 'xray' ? 'xray' : 'amneziawg');
      new CfnOutput(this, `${protocol}Allocation`, { value: address.attrAllocationId });
    }
  }
}

export function hostTemplates(config: DeploymentConfig, guardDuty: boolean): Record<HostSlot | 'addresses', string> {
  // Render standalone templates as assets of the regional release stack, without cross-stack exports or another image pipeline.
  const app = new App({ context: cdkConfig.context });
  const props = { env: { account: config.account, region: config.region }, tags: { ...config.globalTags, System: 'shared' } };
  for (const [key, value] of Object.entries(props.tags)) Tags.of(app).add(key, value);
  const a = new HostSlotStack(app, slotStackName(config.stackName, 'a'), { ...props, deployment: config, slot: 'a', guardDuty });
  const b = new HostSlotStack(app, slotStackName(config.stackName, 'b'), { ...props, deployment: config, slot: 'b', guardDuty });
  const addresses = new TransitionAddressStack(app, transitionAddressStackName(config.stackName), props);
  const assembly = app.synth();
  return Object.fromEntries(Object.entries({ a, b, addresses }).map(([name, stack]) => [name,
    JSON.stringify(assembly.getStackArtifact(stack.artifactId).template)])) as Record<HostSlot | 'addresses', string>;
}
