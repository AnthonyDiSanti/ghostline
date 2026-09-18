import { CfnOutput, Fn, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ecsMemoryBudget } from './ecs-memory.js';
import { ecsUserData } from './ecs-user-data.js';
import type { DeploymentConfig } from './config.js';
import { imageArtifacts, releaseTag, type ImageArtifact } from './ecs-release.js';

export class EcsImagesStack extends Stack {
  readonly repositories: Record<ImageArtifact, ecr.Repository>;
  constructor(scope: Construct, id: string, props: StackProps & { deployment: DeploymentConfig }) {
    super(scope, id, props);
    // Images outlive the disposable endpoint; immutable content tags cannot silently change a release.
    this.repositories = Object.fromEntries(imageArtifacts.map(protocol => {
      const repository = new ecr.Repository(this, protocol, {
        repositoryName: `${props.deployment.resourceName}/${protocol}`, imageTagMutability: ecr.TagMutability.IMMUTABLE,
        removalPolicy: RemovalPolicy.RETAIN, emptyOnDelete: false,
      });
      Tags.of(repository).add('System', protocol === 'gateway-config' ? 'shared' : protocol === 'awg' ? 'amneziawg' : 'xray');
      new CfnOutput(this, `${protocol}Repository`, { value: repository.repositoryUri });
      return [protocol, repository];
    })) as Record<ImageArtifact, ecr.Repository>;
  }
}

export class EcsEndpointStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & {
    deployment: DeploymentConfig; repositories: EcsImagesStack['repositories']; lifecycle: 'active' | 'parked';
  }) {
    super(scope, id, props);
    const config = props.deployment;
    const addresses = Object.fromEntries((['xray', 'awg'] as const).map(protocol => {
      const eip = new ec2.CfnEIP(this, `${protocol}Address`, { domain: 'vpc' });
      eip.applyRemovalPolicy(RemovalPolicy.RETAIN);
      Tags.of(eip).add('System', protocol === 'awg' ? 'amneziawg' : 'xray');
      new CfnOutput(this, protocol === 'xray' ? 'EndpointIp' : 'AwgEndpointIp', { value: eip.ref });
      new CfnOutput(this, protocol === 'xray' ? 'EipAllocationId' : 'AwgEipAllocationId', { value: eip.attrAllocationId });
      return [protocol, eip];
    })) as Record<'xray' | 'awg', ec2.CfnEIP>;
    // Park preserves tracked addresses and the separate image stack without retaining the host/disk.
    if (props.lifecycle === 'parked') return;
    const vpc = new ec2.CfnVPC(this, 'Vpc', { cidrBlock: '10.79.0.0/24', enableDnsHostnames: true, enableDnsSupport: true });
    const gateway = new ec2.CfnInternetGateway(this, 'InternetGateway');
    const attachment = new ec2.CfnVPCGatewayAttachment(this, 'InternetAttachment', { vpcId: vpc.ref, internetGatewayId: gateway.ref });
    const subnet = new ec2.CfnSubnet(this, 'Subnet', { vpcId: vpc.ref, cidrBlock: '10.79.0.0/24', availabilityZone: config.availabilityZone });
    const routes = new ec2.CfnRouteTable(this, 'RouteTable', { vpcId: vpc.ref });
    const route = new ec2.CfnRoute(this, 'InternetRoute', { routeTableId: routes.ref, destinationCidrBlock: '0.0.0.0/0', gatewayId: gateway.ref });
    route.addResourceDependency(attachment);
    const subnetRoutes = new ec2.CfnSubnetRouteTableAssociation(this, 'SubnetRoutes', { subnetId: subnet.ref, routeTableId: routes.ref });
    const security = new ec2.CfnSecurityGroup(this, 'SecurityGroup', {
      vpcId: vpc.ref, groupDescription: 'Authenticated VPN protocols; administration uses Session Manager',
      securityGroupIngress: ['tcp', 'udp'].map(ipProtocol => ({ ipProtocol, fromPort: 443, toPort: 443, cidrIp: '0.0.0.0/0' })),
      securityGroupEgress: [{ ipProtocol: '-1', cidrIp: '0.0.0.0/0', description: 'VPN internet egress and AWS platform APIs' }],
    });
    const nic = new ec2.CfnNetworkInterface(this, 'NetworkInterface', {
      subnetId: subnet.ref, groupSet: [security.attrGroupId],
      privateIpAddresses: [{ privateIpAddress: '10.79.0.10', primary: true }, { privateIpAddress: '10.79.0.11', primary: false }],
    });
    const cluster = new ecs.CfnCluster(this, 'Cluster', { clusterName: config.resourceName });
    const hostRole = new iam.Role(this, 'HostRole', { assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com') });
    // ECS's host agent needs platform registration; it has no Parameter Store or device-key access.
    hostRole.addToPolicy(new iam.PolicyStatement({ actions: ['ecs:CreateCluster', 'ecs:DeregisterContainerInstance',
      'ecs:DiscoverPollEndpoint', 'ecs:Poll', 'ecs:RegisterContainerInstance', 'ecs:StartTelemetrySession',
      'ecs:UpdateContainerInstancesState', 'ecs:Submit*'], resources: ['*'] }));
    hostRole.addToPolicy(new iam.PolicyStatement({ actions: ['ssm:UpdateInstanceInformation',
      'ssmmessages:CreateControlChannel', 'ssmmessages:CreateDataChannel',
      'ssmmessages:OpenControlChannel', 'ssmmessages:OpenDataChannel'], resources: ['*'] }));
    for (const repository of Object.values(props.repositories)) repository.grantPull(hostRole);
    const profile = new iam.CfnInstanceProfile(this, 'InstanceProfile', { roles: [hostRole.roleName] });
    const instance = new ec2.CfnInstance(this, 'Instance', {
      imageId: config.amiId, instanceType: config.instanceType, iamInstanceProfile: profile.ref,
      networkInterfaces: [{ deviceIndex: '0', networkInterfaceId: nic.ref }],
      metadataOptions: { httpTokens: 'required', httpPutResponseHopLimit: 1 },
      blockDeviceMappings: [{ deviceName: '/dev/xvda', ebs: { volumeSize: config.rootVolumeGiB,
        volumeType: 'gp3', encrypted: true, deleteOnTermination: true } }],
      propagateTagsToVolumeOnCreation: true, creditSpecification: { cpuCredits: 'unlimited' },
      userData: Fn.base64(ecsUserData(config, config.resourceName)),
    });
    // The host must terminate (and deregister) before CloudFormation deletes its ECS cluster.
    instance.addResourceDependency(cluster);
    // Keep agent authority until the host terminates; otherwise service/cluster deletion can stall.
    instance.node.addDependency(hostRole.node.findChild('DefaultPolicy'));
    instance.addResourceDependency(route); instance.addResourceDependency(subnetRoutes);
    Tags.of(instance).add('Name', config.resourceName);
    const associations = (['xray', 'awg'] as const).map(protocol => {
      const association = new ec2.CfnEIPAssociation(this, `${protocol}Association`, { allocationId: addresses[protocol].attrAllocationId,
        networkInterfaceId: nic.ref, privateIpAddress: protocol === 'xray' ? '10.79.0.11' : '10.79.0.10' });
      association.addResourceDependency(instance);
      return association;
    });
    // One scheduling and release unit shares capacity; engines retain separate network/mount namespaces.
    const memory = ecsMemoryBudget(config.instanceType);
    const execution = new iam.Role(this, 'GatewayExecutionRole', { assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com') });
    for (const repository of Object.values(props.repositories)) repository.grantPull(execution);
    execution.addToPolicy(new iam.PolicyStatement({ actions: ['ssm:GetParameters'],
      resources: ['xray', 'awg'].map(protocol => `arn:aws:ssm:${config.region}:${config.account}:parameter/ghostline/prod/server/${protocol}`) }));
    const engines = (['xray', 'awg'] as const).map(protocol => ({ name: protocol, essential: true,
      image: `${props.repositories[protocol].repositoryUri}:${releaseTag(protocol)}`,
      cpu: 256, readonlyRootFilesystem: true,
      restartPolicy: { enabled: true, restartAttemptPeriod: 60 },
      dnsServers: ['1.1.1.1', '1.0.0.1'],
      dockerSecurityOptions: ['no-new-privileges'],
      portMappings: [{ containerPort: 443, hostPort: 443, protocol: protocol === 'xray' ? 'tcp' : 'udp' }],
      user: protocol === 'xray' ? '65532:65532' : '0:65532',
      dependsOn: [{ containerName: 'gateway-config', condition: 'SUCCESS' }],
      mountPoints: [{ sourceVolume: `${protocol}-config`, containerPath: protocol === 'xray' ? '/usr/local/etc/xray' : '/etc/ghostline/awg', readOnly: true }],
      ...(protocol === 'xray' ? {
        command: ['run', '-config', '/usr/local/etc/xray/server.json'],
      } : {}),
      linuxParameters: { initProcessEnabled: true, capabilities: { drop: ['ALL'], add: protocol === 'xray' ? ['NET_BIND_SERVICE'] : ['NET_ADMIN'] },
        tmpfs: [{ containerPath: '/run', size: 16, mountOptions: ['rw', 'nosuid', 'nodev', 'noexec', 'mode=0700'] },
          { containerPath: '/tmp', size: 16, mountOptions: ['rw', 'nosuid', 'nodev', 'noexec'] }],
        ...(protocol === 'awg' ? { devices: [{ hostPath: '/dev/net/tun', containerPath: '/dev/net/tun', permissions: ['read', 'write'] }] } : {}) },
      ...(protocol === 'awg' ? { systemControls: [{ namespace: 'net.ipv4.ip_forward', value: '1' },
        { namespace: 'net.ipv4.conf.all.src_valid_mark', value: '1' }] } : {}),
      logConfiguration: { logDriver: 'json-file', options: { 'max-size': '1m', 'max-file': '1' } },
    }));
    const definition = new ecs.CfnTaskDefinition(this, 'GatewayTask', {
      family: `${config.resourceName}-gateway`, networkMode: 'bridge', requiresCompatibilities: ['EC2'],
      memory: String(memory.task), executionRoleArn: execution.roleArn,
      runtimePlatform: { cpuArchitecture: 'ARM64', operatingSystemFamily: 'LINUX' },
      volumes: [{ name: 'gateway-config', host: { sourcePath: '/run/ghostline-config' } },
        ...(['xray', 'awg'] as const).map(protocol => ({ name: `${protocol}-config`, host: { sourcePath: `/run/ghostline-config/${protocol}` } }))],
      containerDefinitions: [...engines, {
        // Only the short-lived writer receives credentials. Both engines wait for the entire configuration set.
        name: 'gateway-config', essential: false, startTimeout: 60,
        image: `${props.repositories['gateway-config'].repositoryUri}:${releaseTag('gateway-config')}`,
        memory: 64, cpu: 16, user: '65532:65532', readonlyRootFilesystem: true, disableNetworking: true,
        dockerSecurityOptions: ['no-new-privileges'],
        secrets: ['xray', 'awg'].map(protocol => ({ name: `GHOSTLINE_${protocol.toUpperCase()}_BUNDLE`,
          valueFrom: `arn:aws:ssm:${config.region}:${config.account}:parameter/ghostline/prod/server/${protocol}` })),
        mountPoints: [{ sourceVolume: 'gateway-config', containerPath: '/config', readOnly: false }],
        linuxParameters: { initProcessEnabled: true, capabilities: { drop: ['ALL'] } },
        logConfiguration: { logDriver: 'json-file', options: { 'max-size': '1m', 'max-file': '1' } },
      }],
    });
    Tags.of(definition).add('System', 'shared');
    Tags.of(execution).add('System', 'shared');
    // Fixed ports prohibit a surge task; native engine restarts avoid replacing healthy siblings.
    const service = new ecs.CfnService(this, 'GatewayService', { cluster: cluster.attrArn,
      serviceName: `${config.resourceName}-gateway`, taskDefinition: definition.ref, desiredCount: 1, launchType: 'EC2',
      deploymentConfiguration: { minimumHealthyPercent: 0, maximumPercent: 100 }, propagateTags: 'TASK_DEFINITION' });
    associations.forEach(association => service.addResourceDependency(association));
    service.node.addDependency(execution.node.findChild('DefaultPolicy'));
    new CfnOutput(this, 'GatewayServiceName', { value: service.attrName });
    new CfnOutput(this, 'InstanceId', { value: instance.ref });
    new CfnOutput(this, 'ClusterName', { value: config.resourceName });
    new CfnOutput(this, 'NetworkInterfaceId', { value: nic.ref });
    new CfnOutput(this, 'XrayPrivateIp', { value: '10.79.0.11' });
    new CfnOutput(this, 'AwgPrivateIp', { value: '10.79.0.10' });
  }
}
