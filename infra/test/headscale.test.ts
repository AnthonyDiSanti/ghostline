import { describe, expect, it } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { parse } from 'yaml';
import { execFileSync } from 'node:child_process';
import { constants, generateKeyPairSync, privateDecrypt } from 'node:crypto';
import { buildHeadscaleApp } from '../lib/headscale-stack.js';
import { headscaleFiles, headscaleRelayMap, loadHeadscaleConfig, resolveHeadscaleRelease, validateHeadscaleConfig } from '../lib/headscale-config.js';
import { approveHeadscaleEnrollment, headscaleHostChanges, headscaleInitializationAllowed, imageContentMatches, stopHeadscaleTasks } from '../lib/headscale-operator.js';

const config = loadHeadscaleConfig();
const map = { regions: { '901': { regionid: 901, regioncode: 'test', regionname: 'Test', nodes: [{ name: 'test', regionid: 901, hostname: '192.0.2.1', ipv4: '192.0.2.1' }] } } };
const digest = 'sha256:' + 'a'.repeat(64);

describe('Headscale coordinator boundaries', () => {
  it('passes only a public operation handle and ciphertext to remote enrollment commands', async () => {
    // Decrypt the sent bytes independently to prove that the exact approval survives without exposing either field.
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
    const input = { user: 'test-enrollment-user', authId: 'synthetic-enrollment-marker' };
    const output = [{ id: 17, name: 'test-device' }];
    const commands: string[] = [];
    const result = await approveHeadscaleEnrollment(async command => {
      commands.push(command);
      const parts = command.split(' ');
      if (parts.at(-2) === 'approval-key') return publicKey.export({ type: 'spki', format: 'pem' }).toString();
      expect(parts.at(-3)).toBe('approve');
      expect(parts.at(-2)).toBe(commands[0]!.split(' ').at(-1));
      const plain = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from(parts.at(-1)!, 'base64'));
      expect(JSON.parse(plain.toString())).toEqual(input);
      return JSON.stringify(output);
    }, input.user, input.authId);
    expect(result).toEqual(output);
    expect(commands).toHaveLength(2);
    expect(commands.join('\n')).not.toContain(input.authId);
    expect(commands.join('\n')).not.toContain(input.user);
  });
  it('rejects malformed input and never resumes with plaintext when the helper is unavailable', async () => {
    // Earlier deployments can reject the key preparation, but must never invoke the previous argv-based approval path.
    const calls: string[] = [];
    const execute = async (command: string) => { calls.push(command); return ''; };
    await expect(approveHeadscaleEnrollment(execute, 'valid', 'bad input')).rejects.toThrow('Invalid private enrollment');
    expect(calls).toHaveLength(0);
    await expect(approveHeadscaleEnrollment(execute, 'valid', 'synthetic-marker')).resolves.toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('approval-key');
  });
  it('keeps relay identities stable across catalog changes and requires explicit assignment for new targets', () => {
    // Skipping a parked region or reordering targets must preserve the IDs already delivered to clients.
    const relays = ['stockholm-ecs', 'oregon', 'zurich', 'nva'].map(target => ({ target, ip: '192.0.2.1', pin: 'sha256-raw:' + 'a'.repeat(64) }));
    expect(headscaleRelayMap(relays)).toEqual(headscaleRelayMap([...relays].reverse()));
    expect(headscaleRelayMap([relays[3]!]).regions).toHaveProperty('905');
    expect(() => headscaleRelayMap([{ ...relays[0]!, target: 'unassigned' }])).toThrow('explicit');
    expect(() => headscaleRelayMap([{ ...relays[0]!, target: 'constructor' }])).toThrow('explicit');
    expect(() => headscaleRelayMap([relays[0]!, relays[0]!])).toThrow('unique');
  });
  it('waits for actual task exit even when desired-status listings and service counts already report zero', async () => {
    // ECS desired STOPPED is not proof the process exited; configuration/volume handoff must wait through STOPPING.
    let stopping = false, descriptions = 0, waits = 0;
    const call = (args: string[]) => {
      if (args[1] === 'update-service') { stopping = true; return {}; }
      if (args[1] === 'list-tasks') return { taskArns: args.at(-1) === 'RUNNING' ? stopping ? [] : ['task'] : stopping ? ['task'] : [] };
      if (args[1] === 'describe-tasks') return { tasks: [{ arn: 'task', status: ++descriptions === 1 ? 'STOPPING' : 'STOPPED' }], failures: [] };
      if (args[1] === 'describe-services') return { services: [{ desiredCount: 0, runningCount: 0, pendingCount: 0 }] };
      throw new Error('Unexpected task-exit API');
    };
    await stopHeadscaleTasks(call, async () => { waits++; });
    expect(descriptions).toBe(2); expect(waits).toBe(1);
  });
  it('permits initial format only for a fresh encrypted allocation and never for initialized or snapshot state', () => {
    // EBS empty bytes can be pseudorandom; creation provenance and revocation, rather than a zero-byte heuristic, guard data.
    const volume = { VolumeId: 'vol-' + 'a'.repeat(17), CreateTime: '2026-11-18T05:00:00Z', SnapshotId: '', Encrypted: true };
    expect(headscaleInitializationAllowed(volume, undefined, '2026-11-18T04:00:00Z')).toBe(true);
    expect(headscaleInitializationAllowed(volume, { volume: volume.VolumeId, initialized: true }, '2026-11-18T04:00:00Z')).toBe(false);
    expect(headscaleInitializationAllowed({ ...volume, SnapshotId: 'snap-old' }, undefined, '2026-11-18T04:00:00Z')).toBe(false);
    expect(headscaleInitializationAllowed(volume, undefined, '2026-11-18T06:00:00Z')).toBe(false);
    expect(() => headscaleInitializationAllowed(volume, { volume: 'vol-other', initialized: true }, '2026-11-18T04:00:00Z')).toThrow('migration');
  });
  it('accepts only identical mirrored executable configuration and layers', () => {
    const original = { config: { digest }, layers: [{ digest: 'sha256:layer' }] };
    expect(imageContentMatches(original, structuredClone(original))).toBe(true);
    expect(imageContentMatches(original, { ...original, layers: [] })).toBe(false);
    expect(imageContentMatches(original, { manifests: [] })).toBe(false);
  });
  it('replaces changed host artifacts while allowing application-only updates on retained compute', () => {
    // Existing Bottlerocket settings survive user-data edits; never claim a tag/config update activated a new bootstrap.
    const previous = { ami: 'ami-a', image: 'app:v1', hostImage: 'host:v1', hostTemplate: 'template-v1', files: {} };
    expect(headscaleHostChanges(previous, { ...previous, image: 'app:v2', files: { 'config.yaml': 'new' } })).toBe(false);
    expect(headscaleHostChanges(previous, { ...previous, hostImage: 'host:v2' })).toBe(true);
    expect(headscaleHostChanges(previous, { ...previous, hostTemplate: 'template-v2' })).toBe(true);
    expect(headscaleHostChanges(previous, { ...previous, ami: 'ami-b' })).toBe(true);
  });
  it('rejects unknown configuration and region drift before creating resources', () => {
    // The standalone coordinator is not another regional gateway catalog entry.
    expect(() => validateHeadscaleConfig({ ...config, region: 'us-west-2' })).toThrow();
    expect(() => validateHeadscaleConfig({ ...config, secret: 'unused' })).toThrow();
  });
  it('selects a fresh stable upstream release and one executable ARM64 platform', () => {
    // A new stable release must win over any historical local/mirror choice.
    let tag = 'v0.29.7';
    const reader = { download: () => Buffer.from(JSON.stringify({ tag_name: tag, draft: false, prerelease: false })),
      manifest: () => ({ manifests: [{ platform: { os: 'linux', architecture: 'arm64', variant: 'v8' }, digest }] }) };
    expect(resolveHeadscaleRelease(reader).source).toBe('ghcr.io/juanfont/headscale:0.29.7');
    tag = 'v0.30.1'; expect(resolveHeadscaleRelease(reader).version).toBe('0.30.1');
    expect(() => resolveHeadscaleRelease({ ...reader, download: () => Buffer.from(JSON.stringify({ tag_name: tag, draft: false, prerelease: true })) })).toThrow();
  });
  it('renders manual enrollment, owned map and deny-by-default policy without ephemeral database state', () => {
    const files = headscaleFiles(config, map), settings = parse(files['config.yaml']!);
    expect(settings.server_url).toBe('https://ts.bigmantonyd.com');
    expect(settings.database.sqlite.path).toBe('/var/lib/headscale/db.sqlite');
    expect(settings.database.sqlite.write_ahead_log).toBe(true);
    expect(settings.log.level).toBe('disabled');
    expect(settings.logtail.enabled).toBe(false);
    expect(settings.derp).toMatchObject({ server: { enabled: false }, urls: [] });
    expect(settings.oidc).toBeUndefined();
    expect(JSON.parse(files['policy.json']!)).toEqual({ acls: [] });
    expect(files['derp.yaml']).toContain('  901:');
    expect(files['derp.yaml']).not.toContain('"901"');
    expect(() => headscaleFiles(config, { regions: {} })).toThrow();
  });
  it('retains data/address independently and publishes only HTTPS ingress', () => {
    const { state } = buildHeadscaleApp(config);
    const template = Template.fromStack(state).toJSON();
    const resources = Object.values(template.Resources) as any[];
    expect(resources.find(item => item.Type === 'AWS::EC2::Volume')).toMatchObject({ DeletionPolicy: 'Retain', Properties: { Encrypted: true } });
    expect(resources.find(item => item.Type === 'AWS::EC2::EIP')).toMatchObject({ DeletionPolicy: 'Retain' });
    const ingress = resources.filter(item => item.Type === 'AWS::EC2::SecurityGroup').flatMap(item => item.Properties.SecurityGroupIngress);
    expect(ingress.filter(rule => rule.CidrIp === '0.0.0.0/0')).toEqual([{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: '0.0.0.0/0' }]);
  });
  it('enforces one writer and confined container mounts without task cloud credentials', () => {
    const { app, runtime } = buildHeadscaleApp(config, { ami: 'ami-' + 'a'.repeat(17),
      image: 'example.test/headscale:latest-stable', hostImage: 'example.test/host:qualified', files: headscaleFiles(config, map) });
    const template = Template.fromStack(runtime!).toJSON();
    const resources = Object.values(template.Resources) as any[];
    const task = resources.find(item => item.Type === 'AWS::ECS::TaskDefinition').Properties;
    expect(task.TaskRoleArn).toBeUndefined();
    expect(JSON.stringify(template)).toContain('arn:aws:ecr:us-east-1:328549459982:repository/bottlerocket-control');
    expect(JSON.stringify(template)).toContain(':repository/aws-guardduty-agent-ecs-ec2');
    expect(task.ContainerDefinitions[0]).toMatchObject({ User: '65532:65532', ReadonlyRootFilesystem: true,
      MountPoints: [{ SourceVolume: 'state', ContainerPath: '/var/lib/headscale', ReadOnly: false }, { SourceVolume: 'configuration', ContainerPath: '/etc/headscale', ReadOnly: true }] });
    expect(resources.find(item => item.Type === 'AWS::ECS::Service').Properties).toMatchObject({ DesiredCount: 1,
      DeploymentConfiguration: { MinimumHealthyPercent: 0, MaximumPercent: 100 } });
    const policyIds = Object.entries(template.Resources).filter(([, item]: any) => item.Type === 'AWS::IAM::Policy').map(([id]) => id);
    expect(resources.find(item => item.Type === 'AWS::EC2::Instance').DependsOn.some((id: string) => policyIds.includes(id))).toBe(true);
    expect(resources.find(item => item.Type === 'AWS::ECS::Service').DependsOn.some((id: string) => policyIds.includes(id))).toBe(true);
    expect(() => app.synth()).not.toThrow();
  });
  it('holds first-host application admission until the one-time formatting permission is revoked', () => {
    const { runtime } = buildHeadscaleApp(config, { ami: 'ami-' + 'a'.repeat(17), image: 'example.test/app', hostImage: 'example.test/host',
      files: headscaleFiles(config, map), initialize: true, active: false });
    const template = Template.fromStack(runtime!).toJSON();
    expect((Object.values(template.Resources) as any[]).find(resource => resource.Type === 'AWS::ECS::Service').Properties.DesiredCount).toBe(0);
  });
  it('executes persistent-directory and policy replay guards', () => {
    // Execute the actual Python helper with disposable files, never mocked shell bodies.
    expect(execFileSync('python3', ['-B', 'test/fixtures/headscale-host-test.py'], { encoding: 'utf8' })).toContain('passed');
  });
});
