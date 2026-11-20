import { App, CfnOutput, Fn, LegacyStackSynthesizer, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import type { Construct } from 'constructs';
import cdk from '../cdk.json' with { type: 'json' };
import { headscaleNames as names, validateHeadscaleConfig, type HeadscaleConfig } from './headscale-config.js';
import { officialHostRepositories } from './gateway-platform.js';

export class HeadscaleStateStack extends Stack {
  readonly subnet: string; readonly security: string; readonly volume: string;
  readonly address: string; readonly allocation: string; readonly cluster: string;
  readonly image: ecr.Repository; readonly hostImage: ecr.Repository;
  constructor(scope: Construct, config: HeadscaleConfig, props: StackProps) {
    super(scope, names.state, props);
    // Durable resources have independent ownership; changing or stopping compute never destroys the database or address.
    const vpc = new ec2.CfnVPC(this, 'Vpc', { cidrBlock: config.vpcCidr, enableDnsSupport: true, enableDnsHostnames: true });
    const internet = new ec2.CfnInternetGateway(this, 'InternetGateway');
    const attachment = new ec2.CfnVPCGatewayAttachment(this, 'InternetAttachment', { vpcId: vpc.ref, internetGatewayId: internet.ref });
    const subnet = new ec2.CfnSubnet(this, 'Subnet', { vpcId: vpc.ref, cidrBlock: config.vpcCidr, availabilityZone: config.availabilityZone });
    const table = new ec2.CfnRouteTable(this, 'RouteTable', { vpcId: vpc.ref });
    new ec2.CfnSubnetRouteTableAssociation(this, 'SubnetRoute', { subnetId: subnet.ref, routeTableId: table.ref });
    new ec2.CfnRoute(this, 'InternetRoute', { routeTableId: table.ref, destinationCidrBlock: '0.0.0.0/0', gatewayId: internet.ref }).addDependency(attachment);
    const security = new ec2.CfnSecurityGroup(this, 'Security', { vpcId: vpc.ref, groupDescription: 'Headscale HTTPS; private SSM administration',
      securityGroupIngress: [{ ipProtocol: 'tcp', fromPort: 443, toPort: 443, cidrIp: '0.0.0.0/0' }],
      securityGroupEgress: [{ ipProtocol: 'tcp', fromPort: 443, toPort: 443, cidrIp: '0.0.0.0/0' },
        ...['tcp', 'udp'].map(ipProtocol => ({ ipProtocol, fromPort: 53, toPort: 53, cidrIp: '10.83.0.2/32' }))] });
    const telemetrySg = new ec2.CfnSecurityGroup(this, 'TelemetrySecurity', { vpcId: vpc.ref, groupDescription: 'GuardDuty telemetry from coordinator host',
      securityGroupIngress: [{ ipProtocol: 'tcp', fromPort: 443, toPort: 443, sourceSecurityGroupId: security.attrGroupId }],
      securityGroupEgress: [{ ipProtocol: 'icmp', fromPort: 252, toPort: 86, cidrIp: '255.255.255.255/32' }] });
    new ec2.CfnVPCEndpoint(this, 'TelemetryEndpoint', { vpcId: vpc.ref, vpcEndpointType: 'Interface',
      serviceName: `com.amazonaws.${config.region}.guardduty-data`, subnetIds: [subnet.ref], securityGroupIds: [telemetrySg.attrGroupId], privateDnsEnabled: true,
      policyDocument: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: '*', Action: '*', Resource: '*' },
        { Effect: 'Deny', Principal: '*', Action: '*', Resource: '*', Condition: { StringNotEquals: { 'aws:PrincipalAccount': config.account } } }] } });
    // Both GuardDuty scan modes honor this volume-only exclusion. The host and its OS/runtime disks retain coverage.
    const volume = new ec2.CfnVolume(this, 'ApplicationData', { availabilityZone: config.availabilityZone, encrypted: true,
      size: config.volumeGiB, volumeType: 'gp3', tags: [{ key: 'GuardDutyExcluded', value: 'true' }] });
    volume.applyRemovalPolicy(RemovalPolicy.RETAIN);
    const address = new ec2.CfnEIP(this, 'Address', { domain: 'vpc' }); address.applyRemovalPolicy(RemovalPolicy.RETAIN);
    new route53.CfnRecordSet(this, 'Dns', { hostedZoneId: config.hostedZoneId, name: config.hostname, type: 'A', ttl: '60', resourceRecords: [address.ref] });
    this.image = new ecr.Repository(this, 'ApplicationRepository', { repositoryName: names.imageRepository, imageTagMutability: ecr.TagMutability.IMMUTABLE, removalPolicy: RemovalPolicy.RETAIN });
    this.hostImage = new ecr.Repository(this, 'HostRepository', { repositoryName: names.hostRepository, imageTagMutability: ecr.TagMutability.IMMUTABLE, removalPolicy: RemovalPolicy.RETAIN });
    const cluster = new ecs.CfnCluster(this, 'Cluster', { clusterName: names.cluster });
    this.subnet = subnet.ref; this.security = security.attrGroupId; this.volume = volume.ref;
    this.address = address.ref; this.allocation = address.attrAllocationId; this.cluster = cluster.ref;
    for (const [key, value] of Object.entries({ Subnet: this.subnet, Security: this.security, Volume: this.volume,
      Address: this.address, Allocation: this.allocation, Cluster: this.cluster, ApplicationRepository: this.image.repositoryUri, HostRepository: this.hostImage.repositoryUri })) new CfnOutput(this, key + 'Output', { value }).overrideLogicalId(key);
  }
}

export interface HeadscaleRuntimeInputs { ami: string; hostImage: string; image: string; proxyImage: string; files: Record<string, string>; hostTemplate?: string; initialize?: boolean; active?: boolean }
export class HeadscaleRuntimeStack extends Stack {
  constructor(scope: Construct, config: HeadscaleConfig, state: HeadscaleStateStack, inputs: HeadscaleRuntimeInputs, props: StackProps) {
    super(scope, names.runtime, props);
    // ECS service updates stop before start; only this host may attach the single-writer application volume.
    const host = new iam.Role(this, 'HostRole', { assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com') });
    host.addToPolicy(new iam.PolicyStatement({ actions: ['ecs:CreateCluster', 'ecs:DeregisterContainerInstance', 'ecs:DiscoverPollEndpoint', 'ecs:Poll',
      'ecs:RegisterContainerInstance', 'ecs:StartTelemetrySession', 'ecs:UpdateContainerInstancesState', 'ecs:SubmitAttachmentStateChanges', 'ecs:SubmitContainerStateChange', 'ecs:SubmitTaskStateChange'], resources: ['*'] }));
    host.addToPolicy(new iam.PolicyStatement({ actions: ['ssm:UpdateInstanceInformation', 'ssmmessages:CreateControlChannel', 'ssmmessages:CreateDataChannel',
      'ssmmessages:OpenControlChannel', 'ssmmessages:OpenDataChannel', 'ssm:GetManifest'], resources: ['*'] }));
    host.addToPolicy(new iam.PolicyStatement({ actions: ['ssm:DescribeDocument', 'ssm:GetDocument'], resources: [`arn:aws:ssm:${config.region}::document/AmazonGuardDuty-RuntimeMonitoringSsmPlugin`] }));
    state.hostImage.grantPull(host);
    host.addToPolicy(new iam.PolicyStatement({ actions: ['ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage'],
      resources: officialHostRepositories(config.region, true) }));
    const profile = new iam.CfnInstanceProfile(this, 'Profile', { roles: [host.roleName] });
    const data = Fn.base64(this.toJsonString({ volume: state.volume, volumeBytes: config.volumeGiB * 1024 ** 3, files: inputs.files, initialize: inputs.initialize ?? false, phase: 'bootstrap' }));
    const diagnostic = Fn.base64(this.toJsonString({ volume: state.volume, volumeBytes: config.volumeGiB * 1024 ** 3, phase: 'diagnostic' }));
    const userData = Fn.join('', [`[settings.ecs]\ncluster = "${names.cluster}"\nreserved-memory = 512\nallow-privileged-containers = false\nlogging-drivers = ["json-file"]\n`,
      '[settings.ecs.instance-attributes]\nheadscale_storage = "ready"\n[settings.host-containers.admin]\nenabled = false\n',
      '[settings.kernel.modules.br_netfilter]\nallowed = true\nautoload = true\n[settings.kernel.sysctl]\n"net.bridge.bridge-nf-call-iptables" = "1"\n',
      '[settings.bootstrap-containers.headscale]\nmode = "always"\nessential = true\nsource = "', inputs.hostImage, '"\nuser-data = "', data, '"\n',
      '[settings.host-containers.ghostline-diagnostics]\nenabled = false\nsuperpowered = true\nsource = "', inputs.hostImage, '"\nuser-data = "', diagnostic, '"\n']);
    const instance = new ec2.CfnInstance(this, 'Instance', { imageId: inputs.ami, instanceType: config.instanceType,
      subnetId: state.subnet, securityGroupIds: [state.security], iamInstanceProfile: profile.ref,
      metadataOptions: { httpTokens: 'required', httpPutResponseHopLimit: 1 }, userData: Fn.base64(userData),
      blockDeviceMappings: [{ deviceName: '/dev/xvda', ebs: { volumeSize: 2, volumeType: 'gp3', encrypted: true, deleteOnTermination: true } },
        // The official AMI's data snapshot is 20 GiB; EC2 cannot shrink it during launch.
        { deviceName: '/dev/xvdb', ebs: { volumeSize: 20, volumeType: 'gp3', encrypted: true, deleteOnTermination: true } }],
      propagateTagsToVolumeOnCreation: true, tags: [{ key: 'GuardDutyManaged', value: 'true' }, { key: 'Name', value: names.cluster }] });
    // Essential bootstrap may pull immediately; its narrowly scoped policy must exist before the host starts.
    instance.node.addDependency(host.node.findChild('DefaultPolicy'));
    const volume = new ec2.CfnVolumeAttachment(this, 'DataAttachment', { instanceId: instance.ref, volumeId: state.volume, device: '/dev/sdf' });
    const address = new ec2.CfnEIPAssociation(this, 'Address', { instanceId: instance.ref, allocationId: state.allocation });
    const execution = new iam.Role(this, 'ExecutionRole', { assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com') }); state.image.grantPull(execution);
    // The proxy has its own writable certificate directory and a single private link to the backend.
    const task = new ecs.CfnTaskDefinition(this, 'Task', { family: names.family, networkMode: 'bridge', requiresCompatibilities: ['EC2'],
      runtimePlatform: { cpuArchitecture: 'ARM64', operatingSystemFamily: 'LINUX' }, executionRoleArn: execution.roleArn, memory: '640',
      volumes: [{ name: 'state', host: { sourcePath: '/mnt/headscale/lib' } }, { name: 'configuration', host: { sourcePath: '/mnt/headscale/config' } },
        { name: 'tls-state', host: { sourcePath: '/mnt/headscale/tls' } },
        { name: 'tls-configuration', host: { sourcePath: '/mnt/headscale/config/Caddyfile' } }],
      containerDefinitions: [{ name: 'headscale', image: inputs.image, essential: true, command: ['serve'], user: '65532:65532',
        readonlyRootFilesystem: true, dockerSecurityOptions: ['no-new-privileges'], memory: 512, cpu: 256,
        linuxParameters: { initProcessEnabled: true, capabilities: { drop: ['ALL'] },
          tmpfs: [{ containerPath: '/run/headscale', size: 8, mountOptions: ['rw', 'nosuid', 'nodev', 'noexec', 'mode=0700', 'uid=65532', 'gid=65532'] },
            { containerPath: '/tmp', size: 8, mountOptions: ['rw', 'nosuid', 'nodev', 'noexec', 'mode=0700', 'uid=65532', 'gid=65532'] }] },
        mountPoints: [{ sourceVolume: 'state', containerPath: '/var/lib/headscale', readOnly: false }, { sourceVolume: 'configuration', containerPath: '/etc/headscale', readOnly: true }],
        healthCheck: { command: ['CMD', '/ko-app/headscale', 'health'], interval: 30, timeout: 5, retries: 3, startPeriod: 120 },
        logConfiguration: { logDriver: 'json-file', options: { 'max-size': '1m', 'max-file': '1' } } },
        { name: 'tls', image: inputs.proxyImage, essential: true, user: '65532:65532', readonlyRootFilesystem: true,
          entryPoint: ['/usr/bin/caddy'], command: ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'],
          links: ['headscale:headscale'], dependsOn: [{ containerName: 'headscale', condition: 'HEALTHY' }],
          dockerSecurityOptions: ['no-new-privileges'], memory: 128, cpu: 64,
          linuxParameters: { initProcessEnabled: true, capabilities: { drop: ['ALL'] },
            tmpfs: [{ containerPath: '/config', size: 8, mountOptions: ['rw', 'nosuid', 'nodev', 'noexec', 'mode=0700', 'uid=65532', 'gid=65532'] }] },
          mountPoints: [{ sourceVolume: 'tls-state', containerPath: '/data', readOnly: false },
            { sourceVolume: 'tls-configuration', containerPath: '/etc/caddy/Caddyfile', readOnly: true }],
          portMappings: [{ containerPort: 8443, hostPort: 443, protocol: 'tcp' }],
          logConfiguration: { logDriver: 'json-file', options: { 'max-size': '1m', 'max-file': '1' } } }] });
    const service = new ecs.CfnService(this, 'Service', { cluster: state.cluster, serviceName: names.service,
      taskDefinition: task.ref, launchType: 'EC2', desiredCount: inputs.active === false ? 0 : 1,
      placementConstraints: [{ type: 'memberOf', expression: 'attribute:headscale_storage == ready' }],
      deploymentConfiguration: { minimumHealthyPercent: 0, maximumPercent: 100, deploymentCircuitBreaker: { enable: true, rollback: false } } });
    service.addDependency(volume); service.addDependency(address);
    // Grant creation and role creation are separate resources; avoid an initial task pull racing its policy attachment.
    service.node.addDependency(execution.node.findChild('DefaultPolicy'));
    new CfnOutput(this, 'InstanceOutput', { value: instance.ref }).overrideLogicalId('Instance');
    new CfnOutput(this, 'TaskOutput', { value: task.ref }).overrideLogicalId('Task');
    new CfnOutput(this, 'HostRoleOutput', { value: host.roleName }).overrideLogicalId('HostRole');
  }
}

export function buildHeadscaleApp(config: HeadscaleConfig, inputs?: HeadscaleRuntimeInputs, outdir?: string) {
  // Shared graph for CLI and offline assertions; no AWS lookups or credential generation happen during synthesis.
  config = validateHeadscaleConfig(config);
  const app = new App({ outdir, context: cdk.context });
  for (const [key, value] of Object.entries({ Project: 'ghostline', Environment: 'prod', System: 'shared', Workload: 'headscale' })) Tags.of(app).add(key, value);
  const props = { env: { account: config.account, region: config.region }, synthesizer: new LegacyStackSynthesizer(),
    tags: { Project: 'ghostline', Environment: 'prod', System: 'shared', Workload: 'headscale' } };
  const state = new HeadscaleStateStack(app, config, props);
  const runtime = inputs ? new HeadscaleRuntimeStack(app, config, state, inputs, { ...props, synthesizer: new LegacyStackSynthesizer() }) : undefined;
  return { app, state, runtime };
}
