import { expect, it, vi } from 'vitest';
import { getDeployment } from '../lib/config.js';
import { deployedClientImages } from '../lib/ecs-client-test.js';

function fixture() {
  // Deliberately differ from source-derived release hashes to model an uncommitted image change.
  const config = getDeployment('stockholm-ecs');
  const outputs = { ClusterName: config.resourceName, GatewayServiceName: 'selected-gateway' };
  const image = (artifact: string) => `${config.account}.dkr.ecr.${config.region}.amazonaws.com/${config.resourceName}/${artifact}:sha-${'a'.repeat(64)}`;
  const tasks = { gateway: {
    family: `${config.resourceName}-gateway`, runtimePlatform: { cpuArchitecture: 'ARM64' },
    containerDefinitions: ['xray', 'awg', 'gateway-config'].map(name => ({ name, image: image(name) })),
  }};
  const services = [{ serviceName: 'selected-gateway', status: 'ACTIVE', desiredCount: 1,
    runningCount: 1, pendingCount: 0, deployments: [{}], taskDefinition: 'gateway' }];
  const response = { services, failures: [] as object[] };
  const aws = vi.fn((args: string[]) => args[1] === 'describe-services' ? response : { taskDefinition: tasks[args[3]! as 'gateway'] });
  return { config, outputs, tasks, response, aws, image };
}

it('selects the deployed engine and initializer releases independently of local source hashes', () => {
  const f = fixture();
  expect(deployedClientImages(f.config, f.outputs, f.aws)).toEqual({ xray: f.image('xray'), awg: f.image('awg'),
    'gateway-config': f.image('gateway-config') });
  expect(f.aws.mock.calls[0]![0]).toEqual(['ecs', 'describe-services', '--cluster', f.config.resourceName,
    '--services', 'selected-gateway']);
  expect(f.aws.mock.calls.slice(1).every(([args]) => args[1] === 'describe-task-definition')).toBe(true);
});

it('rejects a task without an explicit ARM64 runtime platform', () => {
  const f = fixture();
  Reflect.deleteProperty(f.tasks.gateway, 'runtimePlatform');
  expect(() => deployedClientImages(f.config, f.outputs, f.aws)).toThrow('architecture');
});

it('refuses missing, stopped or transitioning services before starting any client', () => {
  // A service transition could make the selected task definition differ from the actual serving image.
  for (const mode of ['missing', 'failure', 'stopped', 'pending', 'transition', 'wrong-service']) {
    const f = fixture();
    if (mode === 'missing') f.response.services.pop();
    if (mode === 'failure') f.response.failures.push({ reason: 'MISSING' });
    if (mode === 'stopped') f.response.services[0]!.runningCount = 0;
    if (mode === 'pending') f.response.services[0]!.pendingCount = 1;
    if (mode === 'transition') f.response.services[0]!.deployments.push({});
    if (mode === 'wrong-service') f.response.services[0]!.serviceName = 'unrelated';
    expect(() => deployedClientImages(f.config, f.outputs, f.aws), mode).toThrow(/services/);
  }
  const f = fixture();
  expect(() => deployedClientImages(f.config, {}, f.aws)).toThrow('outputs');
});

it('rejects a foreign task, wrong architecture, missing initializer or unowned mutable image', () => {
  // Service metadata must not redirect local execution to a foreign or unreviewed image.
  for (const mode of ['family', 'architecture', 'initializer', 'registry', 'tag', 'duplicate']) {
    const f = fixture();
    const task = f.tasks.gateway!;
    if (mode === 'family') task.family = 'another-target-xray';
    if (mode === 'architecture') task.runtimePlatform.cpuArchitecture = 'X86_64';
    if (mode === 'initializer') task.containerDefinitions.pop();
    if (mode === 'registry') task.containerDefinitions[0]!.image = 'example.com/xray:latest';
    if (mode === 'tag') task.containerDefinitions[0]!.image = f.image('xray').replace(/sha-.+$/, 'latest');
    if (mode === 'duplicate') task.containerDefinitions.push(task.containerDefinitions[0]!);
    expect(() => deployedClientImages(f.config, f.outputs, f.aws), mode).toThrow(/image/);
  }
});
