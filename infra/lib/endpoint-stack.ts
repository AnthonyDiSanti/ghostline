import { CfnOutput, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import type { DeploymentConfig, LaunchInputs } from './config.js';

export interface EndpointStackProps extends StackProps {
  deployment: DeploymentConfig;
  launch: LaunchInputs;
}

export class EndpointStack extends Stack {
  constructor(scope: Construct, id: string, props: EndpointStackProps) {
    super(scope, id, props);
    const { deployment: config, launch } = props;

    // Plain resources keep this one-host topology free of incidental IAM/custom-resource services.
    const vpc = new ec2.CfnVPC(this, 'Vpc', {
      cidrBlock: '10.77.0.0/24', enableDnsSupport: true, enableDnsHostnames: true,
    });
    const gateway = new ec2.CfnInternetGateway(this, 'InternetGateway');
    const attachment = new ec2.CfnVPCGatewayAttachment(this, 'InternetGatewayAttachment', {
      vpcId: vpc.ref, internetGatewayId: gateway.ref,
    });
    const subnet = new ec2.CfnSubnet(this, 'PublicSubnet', {
      vpcId: vpc.ref, cidrBlock: '10.77.0.0/25',
      availabilityZone: config.availabilityZone, mapPublicIpOnLaunch: false,
    });
    const routeTable = new ec2.CfnRouteTable(this, 'RouteTable', { vpcId: vpc.ref });
    const route = new ec2.CfnRoute(this, 'InternetRoute', {
      routeTableId: routeTable.ref, destinationCidrBlock: '0.0.0.0/0', gatewayId: gateway.ref,
    });
    route.addResourceDependency(attachment);
    const subnetRoutes = new ec2.CfnSubnetRouteTableAssociation(this, 'SubnetRoutes', {
      routeTableId: routeTable.ref, subnetId: subnet.ref,
    });
    const endpoint = new Construct(this, 'Endpoint');
    Tags.of(endpoint).add('System', 'xray');
    const securityGroup = new ec2.CfnSecurityGroup(endpoint, 'SecurityGroup', {
      vpcId: vpc.ref, groupDescription: 'Ghostline tunnel and operator SSH',
      securityGroupIngress: [
        { ipProtocol: 'tcp', fromPort: 443, toPort: 443, cidrIp: '0.0.0.0/0', description: 'Authenticated Xray tunnel' },
        { ipProtocol: 'tcp', fromPort: 22, toPort: 22, cidrIp: launch.operatorSshCidr, description: 'Operator SSH for Amnezia' },
      ],
      // The proxy and installer require normal internet egress; no production network peering exists.
      securityGroupEgress: [{ ipProtocol: '-1', cidrIp: '0.0.0.0/0', description: 'Tunnel and installer internet egress' }],
    });
    const key = new ec2.CfnKeyPair(endpoint, 'SshKey', {
      keyName: config.resourceName, publicKeyMaterial: launch.sshPublicKey,
    });
    const instance = new ec2.CfnInstance(endpoint, 'Instance', {
      imageId: config.amiId, instanceType: config.instanceType, keyName: key.ref,
      networkInterfaces: [{ deviceIndex: '0', subnetId: subnet.ref, groupSet: [securityGroup.attrGroupId], associatePublicIpAddress: false }],
      blockDeviceMappings: [{ deviceName: '/dev/sda1', ebs: {
        volumeSize: config.rootVolumeGiB, volumeType: 'gp3', encrypted: true, deleteOnTermination: true,
      } }],
      propagateTagsToVolumeOnCreation: true,
      creditSpecification: { cpuCredits: 'unlimited' },
    });
    instance.addResourceDependency(route);
    instance.addResourceDependency(subnetRoutes);
    Tags.of(instance).add('Name', config.resourceName);

    // Retain the address independently of the host; its own cost tags survive disassociation.
    const eip = new ec2.CfnEIP(endpoint, 'PublicAddress', { domain: 'vpc' });
    eip.addResourceDependency(attachment);
    eip.applyRemovalPolicy(RemovalPolicy.RETAIN);
    new ec2.CfnEIPAssociation(endpoint, 'AddressAssociation', {
      allocationId: eip.attrAllocationId, instanceId: instance.ref,
    });
    new CfnOutput(this, 'InstanceId', { value: instance.ref });
    new CfnOutput(this, 'EndpointIp', { value: eip.ref });
    new CfnOutput(this, 'EipAllocationId', { value: eip.attrAllocationId });
    new CfnOutput(this, 'SshCommand', { value: `ssh -i .local/keys/${config.resourceName} ubuntu@${eip.ref}` });
  }
}
