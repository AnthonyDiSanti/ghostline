import { Annotations, CfnOutput, Fn, LegacyStackSynthesizer, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { renderAl2023ImageBuildUserData, renderAl2023TrialLaunchUserData } from './al2023-boot-gate.js';

export const al2023GateTrialName = 'GhostlineAl2023BootGateTrial';
export const al2023GateTrialCluster = 'ghostline-al2023-boot-gate-trial';
export const al2023GateTrialAmi = '/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id';
export type Al2023TrialHost = { phase: 'builder' } | { phase: 'derived'; imageId: string };

export class Al2023BootGateTrialStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & {
    bootstrapImage: string; availabilityZone: string; host: Al2023TrialHost;
  }) {
    // This asset-free trial uses CLI credentials without installing shared CDK roles or buckets in Ireland.
    super(scope, id, { ...props, synthesizer: new LegacyStackSynthesizer() });
    if (!props.env?.account || !props.env.region || !props.availabilityZone.startsWith(props.env.region)) {
      throw new Error('The isolated AL2023 gate requires an explicit account, region and matching AZ.');
    }
    Tags.of(this).add('Project', 'ghostline');
    Tags.of(this).add('Environment', 'trial');
    Tags.of(this).add('System', 'platform');

    // A dedicated VPC and empty ingress keep this ordering probe separate from every live exit.
    const vpc = new ec2.CfnVPC(this, 'Vpc', { cidrBlock: '10.80.0.0/24', enableDnsHostnames: true, enableDnsSupport: true });
    const gateway = new ec2.CfnInternetGateway(this, 'InternetGateway');
    const attachment = new ec2.CfnVPCGatewayAttachment(this, 'InternetAttachment', { vpcId: vpc.ref, internetGatewayId: gateway.ref });
    const subnet = new ec2.CfnSubnet(this, 'Subnet', { vpcId: vpc.ref, cidrBlock: '10.80.0.0/24',
      availabilityZone: props.availabilityZone, mapPublicIpOnLaunch: true });
    Annotations.of(subnet).acknowledgeWarning('CloudFormation-Validate::W3010', 'Explicit disposable trial AZ matches its regional catalog input.');
    const routes = new ec2.CfnRouteTable(this, 'RouteTable', { vpcId: vpc.ref });
    const route = new ec2.CfnRoute(this, 'InternetRoute', { routeTableId: routes.ref,
      destinationCidrBlock: '0.0.0.0/0', gatewayId: gateway.ref });
    route.addResourceDependency(attachment);
    new ec2.CfnSubnetRouteTableAssociation(this, 'SubnetRoutes', { subnetId: subnet.ref, routeTableId: routes.ref });
    const security = new ec2.CfnSecurityGroup(this, 'SecurityGroup', { vpcId: vpc.ref,
      groupDescription: 'Isolated AL2023 boot-order probe; no inbound access', securityGroupIngress: [],
      securityGroupEgress: [
        { ipProtocol: 'tcp', fromPort: 443, toPort: 443, cidrIp: '0.0.0.0/0', description: 'AWS APIs and image retrieval' },
        ...(['tcp', 'udp'] as const).map(ipProtocol => ({ ipProtocol, fromPort: 53, toPort: 53,
          cidrIp: '10.80.0.2/32', description: 'VPC resolver' })),
      ] });
    const cluster = props.host.phase === 'derived'
      ? new ecs.CfnCluster(this, 'Cluster', { clusterName: al2023GateTrialCluster }) : undefined;
    const role = new iam.Role(this, 'HostRole', { assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com') });
    if (props.host.phase === 'derived') {
      // The builder has no ECS authority; only the candidate host can join this disposable cluster.
      role.addToPolicy(new iam.PolicyStatement({ actions: ['ecs:DiscoverPollEndpoint', 'ecs:Poll',
        'ecs:DeregisterContainerInstance', 'ecs:StartTelemetrySession',
        'ecs:UpdateContainerInstancesState', 'ecs:Submit*'], resources: ['*'] }));
      role.addToPolicy(new iam.PolicyStatement({ actions: ['ecs:RegisterContainerInstance'],
        resources: [`arn:aws:ecs:${props.env.region}:${props.env.account}:cluster/${al2023GateTrialCluster}`] }));
    }
    role.addToPolicy(new iam.PolicyStatement({ actions: ['ssm:UpdateInstanceInformation',
      'ssmmessages:CreateControlChannel', 'ssmmessages:CreateDataChannel',
      'ssmmessages:OpenControlChannel', 'ssmmessages:OpenDataChannel'], resources: ['*'] }));
    const profile = new iam.CfnInstanceProfile(this, 'InstanceProfile', { roles: [role.roleName] });
    if (props.host.phase === 'derived' && !/^ami-[a-f0-9]{8,17}$/.test(props.host.imageId)) {
      throw new Error('Derived AL2023 trial requires an exact AMI ID.');
    }
    const template = new ec2.CfnLaunchTemplate(this, 'HostLaunchTemplate', {
      launchTemplateData: { imageId: props.host.phase === 'builder'
        ? `resolve:ssm:${al2023GateTrialAmi}` : props.host.imageId },
    });
    if (props.host.phase === 'builder') {
      Annotations.of(template).acknowledgeWarning('CloudFormation-Validate::E1152', 'EC2 resolves the public ECS-optimized AMI parameter at each new launch.');
    }
    const instance = new ec2.CfnInstance(this, 'Instance', { instanceType: 't4g.small',
      iamInstanceProfile: profile.ref,
      launchTemplate: { launchTemplateId: template.ref, version: template.attrLatestVersionNumber },
      networkInterfaces: [{ deviceIndex: '0', subnetId: subnet.ref, groupSet: [security.attrGroupId],
        associatePublicIpAddress: true }],
      metadataOptions: { httpTokens: 'required', httpPutResponseHopLimit: 1 },
      blockDeviceMappings: [{ deviceName: '/dev/xvda', ebs: { volumeSize: 30, volumeType: 'gp3',
        encrypted: true, deleteOnTermination: true } }],
      userData: Fn.base64(props.host.phase === 'builder'
        ? renderAl2023ImageBuildUserData(props.bootstrapImage)
        : renderAl2023TrialLaunchUserData(al2023GateTrialCluster)),
    });
    if (cluster) instance.addResourceDependency(cluster);
    instance.addResourceDependency(route);
    instance.node.addDependency(role.node.findChild('DefaultPolicy'));
    Tags.of(instance).add('Name', `ghostline-al2023-${props.host.phase}-trial`);
    new CfnOutput(this, 'InstanceId', { value: instance.ref });
    if (cluster) new CfnOutput(this, 'ClusterName', { value: cluster.ref });
  }
}
