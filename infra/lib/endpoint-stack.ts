import { CfnOutput, Fn, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
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
    const managedRuntime = config.runtime !== undefined;

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
    const securityGroup = managedRuntime ? undefined : new ec2.CfnSecurityGroup(endpoint, 'SecurityGroup', {
      vpcId: vpc.ref, groupDescription: 'Ghostline tunnel and operator SSH',
      securityGroupIngress: [
        { ipProtocol: 'tcp', fromPort: 443, toPort: 443, cidrIp: '0.0.0.0/0', description: 'Authenticated Xray tunnel' },
        { ipProtocol: 'tcp', fromPort: 22, toPort: 22, cidrIp: launch.operatorSshCidr, description: 'Operator SSH for Amnezia' },
      ],
      // The proxy and installer require normal internet egress; no production network peering exists.
      securityGroupEgress: [{ ipProtocol: '-1', cidrIp: '0.0.0.0/0', description: 'Tunnel and installer internet egress' }],
    });
    // KeyPair tag changes require replacement; preserve this existing, unbilled key's identity.
    const key = new ec2.CfnKeyPair(endpoint, 'SshKey', {
      keyName: config.resourceName, publicKeyMaterial: launch.sshPublicKey,
    });
    const instance = securityGroup && new ec2.CfnInstance(endpoint, 'Instance', {
      imageId: config.amiId, instanceType: config.instanceType, keyName: key.ref,
      networkInterfaces: [{ deviceIndex: '0', subnetId: subnet.ref, groupSet: [securityGroup.attrGroupId], associatePublicIpAddress: false }],
      blockDeviceMappings: [{ deviceName: '/dev/sda1', ebs: {
        volumeSize: config.rootVolumeGiB, volumeType: 'gp3', encrypted: true, deleteOnTermination: true,
      } }],
      propagateTagsToVolumeOnCreation: true,
      creditSpecification: { cpuCredits: 'unlimited' },
    });
    if (instance) {
      instance.addResourceDependency(route);
      instance.addResourceDependency(subnetRoutes);
      Tags.of(instance).add('Name', config.resourceName);
    }

    // Preserve the deployed managed logical IDs and the original retained EIP/key identities.
    let managed: ec2.CfnInstance | undefined;
    let nic: ec2.CfnNetworkInterface | undefined;
    let xrayPrivateIp: string | undefined;
    if (managedRuntime) {
      const host = new Construct(this, 'ManagedHost');
      const group = new ec2.CfnSecurityGroup(host, 'SecurityGroup', {
        vpcId: vpc.ref, groupDescription: 'Ghostline managed protocols and operator SSH',
        securityGroupIngress: [
          { ipProtocol: 'tcp', fromPort: 443, toPort: 443, cidrIp: '0.0.0.0/0', description: 'Authenticated Xray tunnel' },
          { ipProtocol: 'tcp', fromPort: 22, toPort: 22, cidrIp: launch.operatorSshCidr, description: 'Operator SSH' },
          ...(config.runtime?.awgEnabled ? [{ ipProtocol: 'udp', fromPort: 443, toPort: 443, cidrIp: '0.0.0.0/0', description: 'Authenticated AmneziaWG tunnel' }] : []),
        ],
        securityGroupEgress: [{ ipProtocol: '-1', cidrIp: '0.0.0.0/0', description: 'Tunnel and installer internet egress' }],
      });
      nic = new ec2.CfnNetworkInterface(host, 'NetworkInterface', {
        subnetId: subnet.ref, groupSet: [group.attrGroupId], secondaryPrivateIpAddressCount: 1,
        description: 'One private IPv4 per Ghostline protocol',
      });
      xrayPrivateIp = Fn.select(0, nic.attrSecondaryPrivateIpAddresses);
      managed = new ec2.CfnInstance(host, 'Instance', {
        imageId: config.amiId, instanceType: config.instanceType, keyName: key.ref,
        networkInterfaces: [{ deviceIndex: '0', networkInterfaceId: nic.ref }],
        blockDeviceMappings: [{ deviceName: '/dev/sda1', ebs: {
          volumeSize: config.rootVolumeGiB, volumeType: 'gp3', encrypted: true, deleteOnTermination: true,
        } }],
        propagateTagsToVolumeOnCreation: true,
        creditSpecification: { cpuCredits: 'unlimited' },
      });
      managed.addResourceDependency(route);
      managed.addResourceDependency(subnetRoutes);
      Tags.of(managed).add('Name', `${config.resourceName}-managed`);
      const awgAddress = new ec2.CfnEIP(host, 'AwgAddress', { domain: 'vpc' });
      awgAddress.addResourceDependency(attachment);
      awgAddress.applyRemovalPolicy(RemovalPolicy.RETAIN);
      Tags.of(awgAddress).add('System', 'amneziawg');
      const awgAssociation = new ec2.CfnEIPAssociation(host, 'AwgAssociation', {
        allocationId: awgAddress.attrAllocationId, networkInterfaceId: nic.ref, privateIpAddress: nic.attrPrimaryPrivateIpAddress,
      });
      awgAssociation.addResourceDependency(managed);
      new CfnOutput(this, 'ManagedInstanceId', { value: managed.ref });
      new CfnOutput(this, 'ManagedNetworkInterfaceId', { value: nic.ref });
      new CfnOutput(this, 'XrayPrivateIp', { value: xrayPrivateIp });
      new CfnOutput(this, 'AwgPrivateIp', { value: nic.attrPrimaryPrivateIpAddress });
      new CfnOutput(this, 'AwgEndpointIp', { value: awgAddress.ref });
      new CfnOutput(this, 'AwgEipAllocationId', { value: awgAddress.attrAllocationId });
    }

    // Retain the address independently of the host; its own cost tags survive disassociation.
    const eip = new ec2.CfnEIP(endpoint, 'PublicAddress', { domain: 'vpc' });
    eip.addResourceDependency(attachment);
    eip.applyRemovalPolicy(RemovalPolicy.RETAIN);
    const association = new ec2.CfnEIPAssociation(endpoint, 'AddressAssociation', {
      allocationId: eip.attrAllocationId,
      ...(managedRuntime ? { networkInterfaceId: nic!.ref, privateIpAddress: xrayPrivateIp! } : { instanceId: instance!.ref }),
    });
    if (managedRuntime) association.addResourceDependency(managed!);
    new CfnOutput(this, 'InstanceId', { value: managedRuntime ? managed!.ref : instance!.ref });
    new CfnOutput(this, 'EndpointIp', { value: eip.ref });
    new CfnOutput(this, 'EipAllocationId', { value: eip.attrAllocationId });
    new CfnOutput(this, 'SshCommand', { value: `ssh -i .local/keys/${config.resourceName} ubuntu@${eip.ref}` });
  }
}
