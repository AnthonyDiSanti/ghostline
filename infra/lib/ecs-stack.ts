import { CfnCondition, CfnOutput, CfnParameter, Fn, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ecsMemoryBudget } from './ecs-memory.js';
import { gatewayPlatform } from './gateway-platform.js';
import { hostSlotAuthority } from './host-slot-authority.js';
import { hookName } from './releases/names.js';
import { deploymentStages } from './releases/deployment-hook.js';
import type { DeploymentConfig } from './config.js';
import type { GuardDutySupport } from './guardduty-discovery.js';
import { applicationArtifacts as artifacts } from './image-artifacts.js';
import { production, repository } from './releases/model.js';

export interface GatewayPlatform {
  bootstrapImage: string;
  daemonImage: string;
  daemonRepository: string;
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
    for (const protocol of ['xray', 'awg'] as const) {
      const eip = new ec2.CfnEIP(this, `${protocol}Address`, { domain: 'vpc' });
      eip.applyRemovalPolicy(RemovalPolicy.RETAIN);
      Tags.of(eip).add('System', protocol === 'awg' ? 'amneziawg' : 'xray');
      new CfnOutput(this, protocol === 'xray' ? 'EndpointIp' : 'AwgEndpointIp', { value: eip.ref });
      new CfnOutput(this, protocol === 'xray' ? 'EipAllocationId' : 'AwgEipAllocationId', { value: eip.attrAllocationId });
    }
    // Park preserves tracked addresses and regional release support without retaining host storage or compute.
    if (props.lifecycle === 'parked') return;
    const platform = props.gateway?.platform ?? gatewayPlatform(config, props.guardDuty.runtime);
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
    const networkExecution = new iam.Role(this, 'NetworkExecutionRole', { assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com') });
    networkExecution.addToPolicy(new iam.PolicyStatement({ actions: ['ecr:GetAuthorizationToken'], resources: ['*'] }));
    networkExecution.addToPolicy(new iam.PolicyStatement({ actions: ['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchCheckLayerAvailability'],
      resources: [`arn:aws:ecr:${config.region}:${config.account}:repository/${platform.daemonRepository}`] }));
    const provisioner = hostSlotAuthority(this, config, { subnet: subnet.ref, security: security.attrGroupId,
      hostRole: hostRole.roleArn, executionRole: networkExecution.roleArn });
    new CfnOutput(this, 'SubnetId', { value: subnet.ref });
    new CfnOutput(this, 'SecurityGroupId', { value: security.attrGroupId });
    new CfnOutput(this, 'InstanceProfileName', { value: profile.ref });
    new CfnOutput(this, 'NetworkExecutionRoleArn', { value: networkExecution.roleArn });
    new CfnOutput(this, 'SlotProvisionerRoleArn', { value: provisioner.roleArn });
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
    const hook = new iam.Role(this, 'DeploymentHookRole', { assumedBy: new iam.ServicePrincipal('ecs.amazonaws.com') });
    const hookArn = `arn:aws:lambda:${config.region}:${config.account}:function:${hookName}`;
    hook.addToPolicy(new iam.PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [hookArn] }));
    const empty = new CfnParameter(this, 'EmptyGatewayOnCreate', { type: 'String', default: 'false', allowedValues: ['true', 'false'],
      description: 'CLI sets true only while creating shared infrastructure before the first host is ready.' });
    const initial = new CfnCondition(this, 'InitialGateway', { expression: Fn.conditionEquals(empty.valueAsString, 'true') });
    // Omission on later updates preserves the actual power intent; a task-definition update must not wake a stopped region.
    const desired = Fn.conditionIf(initial.logicalId, 0, { Ref: 'AWS::NoValue' });
    const service = new ecs.CfnService(this, 'GatewayService', { cluster: cluster.attrArn,
      serviceName: `${config.resourceName}-gateway`, taskDefinition: definition.ref, desiredCount: desired as unknown as number, launchType: 'EC2',
      placementConstraints: [{ type: 'memberOf', expression: 'attribute:ghostline_candidate == eligible' }],
      deploymentConfiguration: { strategy: 'BLUE_GREEN', minimumHealthyPercent: 100, maximumPercent: 200, bakeTimeInMinutes: 5,
        lifecycleHooks: [{ hookTargetArn: hookArn, roleArn: hook.roleArn, lifecycleStages: [...deploymentStages],
          timeoutConfiguration: { timeoutInMinutes: 30, action: 'ROLLBACK' } }] }, propagateTags: 'TASK_DEFINITION' });
    service.node.addDependency(execution.node.findChild('DefaultPolicy'), hook.node.findChild('DefaultPolicy'));
    new CfnOutput(this, 'GatewayServiceName', { value: service.attrName });
    new CfnOutput(this, 'GatewayTaskDefinitionArn', { value: definition.ref });
    new CfnOutput(this, 'ClusterName', { value: config.resourceName });
  }
}
