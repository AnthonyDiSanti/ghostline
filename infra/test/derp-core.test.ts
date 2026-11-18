import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { Template } from 'aws-cdk-lib/assertions';
import { afterAll, expect, it } from 'vitest';
import { buildApp } from '../lib/app.js';
import { getDeployment, validateDeployment } from '../lib/config.js';
import { gatewayPlatform, networkTaskDefinition } from '../lib/gateway-platform.js';
import { configuredArtifacts, derpReleaseArtifacts } from '../lib/image-artifacts.js';
import { publicationSelection } from '../lib/releases/publication.js';
import { parseRelease, readReleaseManifest, releaseArtifacts, releaseManifest, observedArtifacts, repository, type Release } from '../lib/releases/model.js';

afterAll(() => CloudAssembly.cleanupTemporaryDirectories());
const config = { ...getDeployment('stockholm-ecs'), account: '000000000000', derp: { allowedSources: ['198.51.100.42/32'] } };

it('routes only the approved AWG-address relay/STUN tuples and denies arbitrary DERP egress', () => {
  const result = JSON.parse(execFileSync('python3', ['-B', fileURLToPath(new URL('./fixtures/derp-network.py', import.meta.url))], { encoding: 'utf8' }));
  expect(result.sourcesRejected).toEqual(Array(6).fill(true));
  expect(result.badBindingsRejected).toEqual(Array(3).fill(true));
  expect(result.bindings).toEqual({ xray: '172.17.0.2', awg: '172.17.0.3', 'dns-policy': '172.17.0.4', derp: '172.17.0.5' });
  expect(result.redirect).toContain('-i ens5 -d 10.79.0.10/32 -p tcp --dport 443 -j DNAT --to-destination 172.17.0.5:8443');
  expect(result.missing).toEqual(['-j RETURN']);
  const ingress = result.chains['raw/GHOSTLINE_INGRESS'] as string[];
  expect(ingress.indexOf('-i ens5 -s 198.51.100.42/32 -d 10.79.0.10/32 -p tcp --dport 443 -j RETURN')).toBeLessThan(
    ingress.indexOf('-i ens5 -p tcp --dport 443 ! -d 10.79.0.11/32 -j DROP'));
  expect(ingress).toContain('-i ens5 -p tcp --dport 18443 -j DROP');
  expect(ingress).toContain('-i ens5 -p udp --dport 3478 -j DROP');
  const outgoing = result.rules.filter((rule: string) => rule.includes('-s 172.17.0.5/32') && rule.endsWith('ACCEPT'));
  expect(outgoing).toEqual(['-i docker0 -s 172.17.0.5/32 -o ens5 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT']);
  expect(result.nat).toContain('-s 172.17.0.5/32 -o ens5 -j SNAT --to-source 10.79.0.10');
  expect(result.rules).toContain('-i ens5 -o docker0 -s 198.51.100.42/32 -d 172.17.0.5/32 -p tcp --dport 8443 -m conntrack --ctorigdst 10.79.0.10 --ctorigdstport 443 -j ACCEPT');
});

it('adds one isolated non-root container and references all three server parameters without plaintext injection', () => {
  const { stack } = buildApp(config);
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::EC2::EIP', 2);
  const resources = template.toJSON().Resources as Record<string, any>;
  const task = resources.GatewayTask.Properties;
  expect(task.TaskRoleArn).toBeDefined();
  const derp = task.ContainerDefinitions.find((container: any) => container.Name === 'derp');
  expect(derp).toMatchObject({ Essential: true, User: '65532:65532', ReadonlyRootFilesystem: true, Memory: 128,
    EntryPoint: ['/usr/local/bin/derp-tools', 'serve'], LinuxParameters: { Capabilities: { Drop: ['ALL'] } },
    MountPoints: [{ SourceVolume: 'derp-config', ContainerPath: '/etc/ghostline/derp', ReadOnly: true }] });
  expect(derp.Secrets).toBeUndefined(); expect(derp.Environment).toBeUndefined();
  expect(derp.PortMappings).toEqual([{ ContainerPort: 8443, HostPort: 18443, Protocol: 'tcp' }, { ContainerPort: 3478, HostPort: 3478, Protocol: 'udp' }]);
  const initializer = task.ContainerDefinitions.find((container: any) => container.Name === 'gateway-config');
  expect(initializer.Secrets).toBeUndefined();
  expect(Object.keys(JSON.parse(initializer.Environment[0].Value))).toEqual(['xray', 'awg', 'derp']);
  expect(initializer.Environment.map((item: any) => item.Name)).toEqual(['GHOSTLINE_PARAMETERS']);
  const security = resources.SecurityGroup.Properties;
  expect(security.SecurityGroupIngress).toContainEqual({ IpProtocol: 'udp', FromPort: 3478, ToPort: 3478, CidrIp: '198.51.100.42/32' });
  const platform = gatewayPlatform(config);
  expect(platform.userData).toContain('bootstrap-containers');
  const daemon = networkTaskDefinition(config, platform.daemonImage, 'arn:aws:iam::000000000000:role/test', 'a');
  const environment = (daemon.containerDefinitions as any[])[0].environment;
  expect(JSON.parse(environment.find((value: any) => value.name === 'GHOSTLINE_NETWORK').value).derp).toEqual(config.derp);
});

it('rejects broad/malformed source lists and selects seven artifacts only through explicit fleet agreement', () => {
  for (const sources of [[], ['0.0.0.0/0'], ['198.51.100.0/24'], ['198.51.100.42/32', '198.51.100.42/32']]) {
    expect(() => validateDeployment({ ...config, derp: { allowedSources: sources } })).toThrow('explicit IPv4');
  }
  expect(configuredArtifacts(config)).toEqual(derpReleaseArtifacts);
  expect(publicationSelection([true, true], [true, true])).toMatchObject({ schemaVersion: 5, names: derpReleaseArtifacts });
  expect(() => publicationSelection([true, true], [true, false])).toThrow('DERP release schema');
  expect(() => publicationSelection([false], [true])).toThrow('DERP release schema');
});

it('validates exact seven-image documents without accepting incomplete or accidental eight-image sets', () => {
  const image = (name: typeof derpReleaseArtifacts[number]) => ({ repository: repository(name), digest: `sha256:${'a'.repeat(64)}`,
    runtimeDigest: `sha256:${'a'.repeat(64)}`, buildTag: `sha-${'a'.repeat(64)}` });
  const release: Release = { schemaVersion: 5, promotionId: 'derp-proof-0001', promotedAt: '2026-11-17T00:00:00Z', origin: 'eu-north-1',
    platform: 'linux/arm64', images: Object.fromEntries(derpReleaseArtifacts.map(name => [name, image(name)])) as Release['images'],
    os: { variant: 'aws-ecs-3', architecture: 'arm64', compatibleVersions: ['1.66.0'], targetVersion: '1.66.0' }, history: [] };
  expect(readReleaseManifest(releaseManifest(release))).toEqual(release);
  expect(releaseArtifacts(release)).toEqual(derpReleaseArtifacts);
  expect(observedArtifacts(Object.fromEntries(derpReleaseArtifacts.map(name => [name, image(name).digest])))).toEqual(derpReleaseArtifacts);
  expect(() => parseRelease({ ...release, images: { ...release.images, derp: undefined } })).toThrow('image identity');
  expect(() => parseRelease({ ...release, images: { ...release.images, unexpected: image('derp') } })).toThrow('Invalid release');
});
