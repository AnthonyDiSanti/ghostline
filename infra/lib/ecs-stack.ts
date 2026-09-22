import { CfnOutput, Fn, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ecsMemoryBudget } from './ecs-memory.js';
import { addNetworkDaemon, gatewayPlatform } from './gateway-platform.js';
import { platformImage, platformRepository } from './platform-image.js';
import type { DeploymentConfig } from './config.js';
import type { GuardDutySupport } from './guardduty-discovery.js';
import { artifacts, production, repository } from './releases/model.js';

export interface GatewayPlatform {
  image: string;
  imageRepository: string;
  userData: string;
  configDirectory: string;
  disks: ec2.CfnInstance.BlockDeviceMappingProperty[];
  pullRepositoryArns: string[];
}

export interface GatewayInputs {
  platform?: GatewayPlatform;
  parameterPrefix?: string;
  images?: Record<(typeof artifacts)[number], string>;
}

export class EcsEndpointStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & {
    deployment: DeploymentConfig; lifecycle: 'active' | 'parked'; guardDuty: GuardDutySupport;
    gateway?: GatewayInputs;
  }) {
    super(scope, id, props);
    const config = props.deployment;
    // Isolated host experiments reuse the application graph without touching regional production inputs.
    const parameterPrefix = props.gateway?.parameterPrefix ?? '/ghostline/prod';
    // Durable regional repositories are activated separately and never owned by the disposable endpoint.
    const repositories = Object.fromEntries(artifacts.map(name => [name, ecr.Repository.fromRepositoryName(this, `${name}Repository`, repository(name))]));
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
    const image = props.gateway?.platform?.image ?? platformImage(config);
    const imageRepository = props.gateway?.platform?.imageRepository ?? platformRepository;
    const platform = props.gateway?.platform ?? gatewayPlatform(config, image, imageRepository, props.guardDuty.runtime);
    const configDirectory = platform.configDirectory;
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
    let telemetry: ec2.CfnVPCEndpoint | undefined;
    if (props.guardDuty.runtime) {
      // Match GuardDuty's private/account boundary, tightening ingress from the VPC CIDR to our host.
      const telemetrySecurity = new ec2.CfnSecurityGroup(this, 'GuardDutySecurityGroup', {
        vpcId: vpc.ref, groupDescription: 'Private GuardDuty telemetry from the gateway host',
        securityGroupIngress: [{ ipProtocol: 'tcp', fromPort: 443, toPort: 443, sourceSecurityGroupId: security.attrGroupId }],
        // CloudFormation treats an empty list as default allow-all. Use CDK's no-traffic sentinel instead.
        securityGroupEgress: [{ ipProtocol: 'icmp', fromPort: 252, toPort: 86, cidrIp: '255.255.255.255/32', description: 'Disallow all traffic' }],
      });
      telemetry = new ec2.CfnVPCEndpoint(this, 'GuardDutyEndpoint', {
        vpcId: vpc.ref, vpcEndpointType: 'Interface', serviceName: `com.amazonaws.${config.region}.guardduty-data`,
        subnetIds: [subnet.ref], securityGroupIds: [telemetrySecurity.attrGroupId], privateDnsEnabled: true,
        ipAddressType: 'ipv4', dnsOptions: { dnsRecordIpType: 'ipv4' },
        // This is the exact account boundary AWS automatically installed in the disposable test VPC.
        policyDocument: { Version: '2012-10-17', Statement: [
          { Effect: 'Allow', Principal: '*', Action: '*', Resource: '*' },
          { Effect: 'Deny', Principal: '*', Action: '*', Resource: '*',
            Condition: { StringNotEquals: { 'aws:PrincipalAccount': config.account } } },
        ] },
      });
      Tags.of(telemetrySecurity).add('System', 'shared');
      Tags.of(telemetry).add('System', 'shared');
    }
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
    if (props.guardDuty.runtime) {
      // GuardDuty's automatic Distributor installation needs this internal, unscopable package API.
      // Do not attach AmazonSSMManagedInstanceCore: it also grants unrelated Parameter Store reads.
      hostRole.addToPolicy(new iam.PolicyStatement({ actions: ['ssm:GetManifest'], resources: ['*'] }));
      // Distributor then reads only AWS's public GuardDuty package document, never account-owned documents.
      hostRole.addToPolicy(new iam.PolicyStatement({ actions: ['ssm:DescribeDocument', 'ssm:GetDocument'],
        resources: [`arn:aws:ssm:${config.region}::document/AmazonGuardDuty-RuntimeMonitoringSsmPlugin`] }));
    }
    for (const repository of Object.values(repositories)) repository.grantPull(hostRole);
    if (platform.pullRepositoryArns.length) hostRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage'],
      resources: platform.pullRepositoryArns,
    }));
    const profile = new iam.CfnInstanceProfile(this, 'InstanceProfile', { roles: [hostRole.roleName] });
    const instance = new ec2.CfnInstance(this, 'Instance', {
      imageId: config.amiId, instanceType: config.instanceType, iamInstanceProfile: profile.ref,
      networkInterfaces: [{ deviceIndex: '0', networkInterfaceId: nic.ref }],
      metadataOptions: { httpTokens: 'required', httpPutResponseHopLimit: 1 },
      blockDeviceMappings: platform.disks,
      propagateTagsToVolumeOnCreation: true, creditSpecification: { cpuCredits: 'unlimited' },
      userData: Fn.base64(platform.userData),
    });
    // The host must terminate (and deregister) before CloudFormation deletes its ECS cluster.
    instance.addResourceDependency(cluster);
    // Precreate transport before automatic agent setup; reverse deletion keeps it until host termination.
    if (telemetry) instance.addResourceDependency(telemetry);
    // Keep agent authority until the host terminates; otherwise service/cluster deletion can stall.
    instance.node.addDependency(hostRole.node.findChild('DefaultPolicy'));
    instance.addResourceDependency(route); instance.addResourceDependency(subnetRoutes);
    Tags.of(instance).add('Name', config.resourceName);
    // Inclusion tags let AWS install/update only selected hosts without enabling fleet-wide agent management.
    if (props.guardDuty.runtime) Tags.of(instance).add('GuardDutyManaged', 'true');
    const associations = (['xray', 'awg'] as const).map(protocol => {
      const association = new ec2.CfnEIPAssociation(this, `${protocol}Association`, { allocationId: addresses[protocol].attrAllocationId,
        networkInterfaceId: nic.ref, privateIpAddress: protocol === 'xray' ? '10.79.0.11' : '10.79.0.10' });
      association.addResourceDependency(instance);
      return association;
    });
    // One scheduling and release unit shares capacity; engines retain separate network/mount namespaces.
    const memory = ecsMemoryBudget(config.instanceType);
    const execution = new iam.Role(this, 'GatewayExecutionRole', { assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com') });
    for (const repository of Object.values(repositories)) repository.grantPull(execution);
    execution.addToPolicy(new iam.PolicyStatement({ actions: ['ssm:GetParameters'],
      resources: ['xray', 'awg'].map(protocol => `arn:aws:ssm:${config.region}:${config.account}:parameter${parameterPrefix}/server/${protocol}`) }));
    const engines = (['xray', 'awg'] as const).map(protocol => ({ name: protocol, essential: true,
      image: props.gateway?.images?.[protocol] ?? `${repositories[protocol]!.repositoryUri}:${production}`,
      versionConsistency: 'enabled', cpu: 256, readonlyRootFilesystem: true,
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
      volumes: [{ name: 'gateway-config', host: { sourcePath: configDirectory } },
        ...(['xray', 'awg'] as const).map(protocol => ({ name: `${protocol}-config`, host: { sourcePath: `${configDirectory}/${protocol}` } }))],
      containerDefinitions: [...engines, {
        // Only the short-lived writer receives credentials. Both engines wait for the entire configuration set.
        name: 'gateway-config', essential: false, startTimeout: 60,
        image: props.gateway?.images?.['gateway-config'] ?? `${repositories['gateway-config']!.repositoryUri}:${production}`,
        versionConsistency: 'enabled', memory: 64, cpu: 16, user: '65532:65532', readonlyRootFilesystem: true, disableNetworking: true,
        dockerSecurityOptions: ['no-new-privileges'],
        secrets: ['xray', 'awg'].map(protocol => ({ name: `GHOSTLINE_${protocol.toUpperCase()}_BUNDLE`,
          valueFrom: `arn:aws:ssm:${config.region}:${config.account}:parameter${parameterPrefix}/server/${protocol}` })),
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
      deploymentConfiguration: { minimumHealthyPercent: 0, maximumPercent: 100, deploymentCircuitBreaker: { enable: true, rollback: true } }, propagateTags: 'TASK_DEFINITION' });
    associations.forEach(association => service.addResourceDependency(association));
    service.node.addDependency(execution.node.findChild('DefaultPolicy'));
    const daemon = addNetworkDaemon(this, config, image, imageRepository);
    // Keep agent internet access until the last service is deleted; an IP-less host cannot acknowledge daemon stop.
    associations.forEach(association => daemon.addResourceDependency(association));
    new CfnOutput(this, 'GatewayServiceName', { value: service.attrName });
    new CfnOutput(this, 'InstanceId', { value: instance.ref });
    new CfnOutput(this, 'ClusterName', { value: config.resourceName });
    new CfnOutput(this, 'NetworkInterfaceId', { value: nic.ref });
    new CfnOutput(this, 'XrayPrivateIp', { value: '10.79.0.11' });
    new CfnOutput(this, 'AwgPrivateIp', { value: '10.79.0.10' });
  }
}
