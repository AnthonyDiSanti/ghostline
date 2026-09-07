import { afterAll, describe, expect, it } from 'vitest';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { buildApp } from '../lib/app.js';
import { launch } from './fixture.js';
import { deploymentIds, getDeployment } from '../lib/config.js';

afterAll(() => CloudAssembly.cleanupTemporaryDirectories());

function onlyResource(template: Template, type: string) {
  // Return the logical ID too so wiring checks prove relationships, not just resource presence.
  const entries = Object.entries(template.findResources(type));
  expect(entries).toHaveLength(1);
  return entries[0]!;
}

describe.each(deploymentIds)('single endpoint: %s', (target) => {
  const testDeployment = { ...getDeployment(target), account: '000000000000' };
  const { stack } = buildApp(launch, testDeployment);
  const template = Template.fromStack(stack);

  it('contains only the required networking and host resources', () => {
    for (const type of ['VPC', 'Subnet', 'InternetGateway', 'Route', 'RouteTable', 'Instance', 'EIP', 'EIPAssociation', 'KeyPair', 'SecurityGroup']) {
      template.resourceCountIs(`AWS::EC2::${type}`, 1);
    }
    for (const type of ['AWS::EC2::NatGateway', 'AWS::EC2::VPCEndpoint', 'AWS::EC2::FlowLog', 'AWS::ElasticLoadBalancingV2::LoadBalancer', 'AWS::ECS::Cluster', 'AWS::IAM::Role', 'AWS::IAM::InstanceProfile', 'AWS::Lambda::Function']) {
      template.resourceCountIs(type, 0);
    }
  });
  it('uses the pinned host and encrypted root disk without a second public IP', () => {
    template.hasResourceProperties('AWS::EC2::Instance', {
      ImageId: testDeployment.amiId, InstanceType: 't3.small',
      BlockDeviceMappings: [{ DeviceName: '/dev/sda1', Ebs: { Encrypted: true, VolumeSize: 20, VolumeType: 'gp3', DeleteOnTermination: true } }],
      PropagateTagsToVolumeOnCreation: true,
      NetworkInterfaces: Match.arrayWith([Match.objectLike({ AssociatePublicIpAddress: false })]),
    });
    template.hasResourceProperties('AWS::EC2::Subnet', { AvailabilityZone: testDeployment.availabilityZone, MapPublicIpOnLaunch: false });
    const [, instance] = onlyResource(template, 'AWS::EC2::Instance');
    expect(instance.Properties).not.toHaveProperty('IamInstanceProfile');
    expect(instance.Properties).not.toHaveProperty('UserData');
  });
  it('binds the retained EIP to the intended instance', () => {
    const [instanceId] = onlyResource(template, 'AWS::EC2::Instance');
    const [addressId, address] = onlyResource(template, 'AWS::EC2::EIP');
    template.hasResourceProperties('AWS::EC2::EIPAssociation', {
      InstanceId: { Ref: instanceId }, AllocationId: { 'Fn::GetAtt': [addressId, 'AllocationId'] },
    });
    expect(address.DeletionPolicy).toBe('Retain');
    expect(address.UpdateReplacePolicy).toBe('Retain');
  });
  it('restricts SSH while accepting the public tunnel listener', () => {
    const [, group] = onlyResource(template, 'AWS::EC2::SecurityGroup');
    expect(group.Properties.SecurityGroupIngress).toEqual([
      expect.objectContaining({ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: '0.0.0.0/0' }),
      expect.objectContaining({ IpProtocol: 'tcp', FromPort: 22, ToPort: 22, CidrIp: launch.operatorSshCidr }),
    ]);
  });
  it('uses public key material and nonsecret endpoint outputs', () => {
    template.hasResourceProperties('AWS::EC2::KeyPair', { PublicKeyMaterial: launch.sshPublicKey.trim() });
    expect(Object.keys(template.toJSON().Outputs)).toEqual(expect.arrayContaining(['InstanceId', 'EndpointIp', 'EipAllocationId', 'SshCommand']));
    expect(JSON.stringify(template.toJSON().Outputs)).not.toContain(launch.sshPublicKey.trim());
  });
  it('applies consolidated billing dimensions and resource roles', () => {
    for (const type of ['AWS::EC2::Instance', 'AWS::EC2::EIP', 'AWS::EC2::KeyPair', 'AWS::EC2::SecurityGroup', 'AWS::EC2::VPC', 'AWS::EC2::Subnet', 'AWS::EC2::RouteTable', 'AWS::EC2::InternetGateway']) {
      const [, resource] = onlyResource(template, type);
      const endpointType = ['Instance', 'EIP', 'KeyPair', 'SecurityGroup'].some((suffix) => type === `AWS::EC2::${suffix}`);
      expect(resource.Properties.Tags).toEqual(expect.arrayContaining([
        { Key: 'Project', Value: 'ghostline' }, { Key: 'Environment', Value: 'prod' },
        { Key: 'System', Value: endpointType ? 'xray' : 'shared' },
      ]));
    }
  });
});
