import { describe, expect, it, vi } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { benchmarkBucket, BenchmarkProbeStack, BenchmarkStorageStack } from '../lib/benchmark/stack.js';
import { classifyAccess, createJournal, simulateStream, stableControls, validateCampaign, type Measurement, type Speed } from '../lib/benchmark/model.js';
import { assertDisposableRegion, report, summary } from '../lib/benchmark/runner.js';
import { runCohort, requestCleanup, schedule, pairedComparisons, type CohortPorts } from '../lib/benchmark/cohort.js';
import catalog from '../deployment.json' with { type: 'json' };
import { measurementDeadline } from '../lib/benchmark/measurement.js';

const campaign = { id: 'test', regions: ['eu-central-1'], source: 'stockholm-ecs', canary: { url: 'https://example.com/', expectedText: 'Example Domain' } };
const speed = (mbps: number): Speed => ({ mbps, bytes: 1_000_000, seconds: 10, limited: false });

describe('benchmark input and ownership boundaries', () => {
  it('rejects credentials and non-HTTPS canaries, duplicate/unknown inputs', () => {
    expect(validateCampaign(campaign)).toEqual(campaign);
    for (const url of ['http://example.com', 'https://user:secret@example.com', 'https://127.0.0.1', 'https://localhost']) {
      expect(() => validateCampaign({ ...campaign, canary: { ...campaign.canary, url } })).toThrow();
    }
    expect(() => validateCampaign({ ...campaign, regions: ['eu-central-1', 'eu-central-1'] })).toThrow();
    expect(() => validateCampaign({ ...campaign, extra: true })).toThrow();
  });
  it('protects production gateways, publishers and excluded locations', () => {
    for (const region of ['eu-north-1', 'af-south-1', 'us-east-1', 'eu-west-2', 'il-central-1', 'me-central-1']) expect(() => assertDisposableRegion(region, catalog)).toThrow();
    expect(() => assertDisposableRegion('eu-central-1', catalog)).not.toThrow();
  });
  it('omits the private canary from exported aggregate reports', () => {
    expect(JSON.stringify(report(createJournal(campaign)))).not.toContain('example.com');
  });
  it('keeps source and candidate observations in the readable report', () => {
    const journal = createJournal(campaign);
    journal.records[0]!.target = 'candidate';
    journal.cohort = { phase: 'measure', deep: [], blocks: [{ round: 1, protocol: 'xray', calibration: [], complete: true,
      samples: ['stockholm-ecs', 'candidate'].map(target => ({ target, measurement: { protocol: 'xray', access: { status: 'pass', reason: 'fixture' }, speed: speed(20), valid: false } })) }] };
    const text = summary(journal);
    expect(text).toContain('stockholm-ecs'); expect(text).toContain('eu-central-1');
    expect(text).toContain('inconclusive'); expect(text).not.toContain('example.com');
  });
});

describe('openness and region phases', () => {
  it('requires content, preserves uncertainty and distinguishes explicit geography', () => {
    expect(classifyAccess(200, 'Example Domain', true).status).toBe('pass');
    expect(classifyAccess(200, 'Just a moment, checking your browser', true).status).toBe('inconclusive');
    expect(classifyAccess(403, 'Access denied', false).status).toBe('inconclusive');
    expect(classifyAccess(451, 'Not available in your country', false).status).toBe('restricted');
    expect(classifyAccess(200, 'Verify your age to continue', false).status).toBe('restricted');
    expect(classifyAccess(200, 'Membership signup link', false).status).toBe('inconclusive');
  });
  function ports(status: 'pass' | 'restricted' | 'inconclusive'): CohortPorts {
    return { save: vi.fn(), probe: vi.fn(async () => ({ status, reason: 'fixture' })), cleanupProbe: vi.fn(async () => {}),
      provision: vi.fn(async r => { r.target = r.region; }), prepare: vi.fn(async () => {}), calibrate: vi.fn(async () => [speed(100)]),
      measure: vi.fn(async (_target, protocol) => ({ protocol, access: { status: 'pass' as const, reason: 'fixture' }, valid: false })),
      cleanupGateway: vi.fn(async () => {}), cleanupFixture: vi.fn(async () => {}) };
  }
  it.each(['restricted', 'inconclusive'] as const)('never deploys a gateway after %s', async status => {
    const journal = createJournal(campaign), p = ports(status);
    await runCohort(journal, p);
    expect(p.provision).not.toHaveBeenCalled(); expect(p.measure).not.toHaveBeenCalled(); expect(journal.complete).toBe(true);
  });
  it('probes the entire cohort before provisioning and provisions before measurements', async () => {
    const journal = createJournal({ ...campaign, regions: ['eu-central-1', 'eu-south-1'] }), p = ports('pass'), order: string[] = [];
    p.probe = async r => { order.push('probe:' + r.region); return { status: 'pass', reason: 'fixture' }; };
    p.provision = async r => { order.push('provision:' + r.region); r.target = r.region; };
    p.measure = async (target, protocol) => { order.push('measure:' + target); return { protocol, access: { status: 'pass', reason: 'fixture' } }; };
    await runCohort(journal, p);
    expect(order.slice(0, 5)).toEqual(['probe:eu-central-1', 'probe:eu-south-1', 'provision:eu-central-1', 'provision:eu-south-1', 'measure:stockholm-ecs']);
    expect(p.cleanupGateway).toHaveBeenCalledTimes(2);
    expect(journal.cohort?.blocks).toHaveLength(4);
  });
  it('reverses region and protocol order across rounds', () => {
    expect(schedule(['source', 'candidate'], 2)).toEqual([
      { round: 1, protocol: 'xray', targets: ['source', 'candidate'] }, { round: 1, protocol: 'awg', targets: ['source', 'candidate'] },
      { round: 2, protocol: 'awg', targets: ['candidate', 'source'] }, { round: 2, protocol: 'xray', targets: ['candidate', 'source'] }]);
    for (const rounds of [0, 4, 1.5]) expect(() => validateCampaign({ ...campaign, rounds })).toThrow();
  });
  it('retires explicit cleanup instead of reopening a partially provisioned campaign', async () => {
    const journal = createJournal(campaign), p = ports('pass');
    journal.cohort = { phase: 'provision', blocks: [], deep: [] };
    requestCleanup(journal);
    await expect(runCohort(journal, p)).rejects.toThrow('Cleanup completed');
    expect(p.provision).not.toHaveBeenCalled(); expect(p.measure).not.toHaveBeenCalled();
    expect(journal.cohort.phase).toBe('failed');
    await expect(runCohort(journal, p)).rejects.toThrow('already failed');
  });
  it('resumes failed cleanup without repeating measurement or provisioning', async () => {
    const journal = createJournal(campaign), p = ports('pass');
    p.cleanupGateway = vi.fn().mockRejectedValueOnce(new Error('pending')).mockResolvedValue(undefined);
    await expect(runCohort(journal, p)).rejects.toThrow('pending'); expect(journal.cohort?.phase).toBe('cleanup');
    await runCohort(journal, p); await runCohort(journal, p);
    expect(p.provision).toHaveBeenCalledOnce(); expect(p.measure).toHaveBeenCalledTimes(8);
  });
  it('cleans partial provisioning on failure without exposing provider payloads', async () => {
    const journal = createJournal(campaign), p = ports('pass');
    p.provision = async () => { throw new Error('sensitive payload'); };
    await expect(runCohort(journal, p)).rejects.toThrow('Cleanup completed');
    expect(p.cleanupGateway).toHaveBeenCalledOnce(); expect(JSON.stringify(journal)).not.toContain('sensitive payload');
    expect(journal.cohort?.phase).toBe('failed');
    expect(report(journal)).toMatchObject({ complete: false, cleanupComplete: true });
    await expect(runCohort(journal, p)).rejects.toThrow('already failed');
  });
  it('preserves an interrupted block and repeats it as a complete timed unit', async () => {
    const journal = createJournal({ ...campaign, rounds: 1 }), p = ports('pass');
    journal.records[0]!.access = { status: 'pass', reason: 'fixture' }; journal.records[0]!.target = 'candidate';
    journal.cohort = { phase: 'measure', deep: [], blocks: [{ round: 1, protocol: 'xray', calibration: [], complete: false,
      samples: [{ target: 'stockholm-ecs', measurement: { protocol: 'xray', access: { status: 'pass', reason: 'old' } } }] }] };
    await runCohort(journal, p);
    expect(p.provision).not.toHaveBeenCalled(); expect(p.measure).toHaveBeenCalledTimes(4);
    expect(journal.cohort.blocks.map(b => b.complete)).toEqual([false, true, true]);
    expect(pairedComparisons(journal.cohort.blocks, 'stockholm-ecs').every(p => !p.comparable)).toBe(true);
  });
  it('deepens qualified protocols on the same hosts before any cleanup', async () => {
    const journal = createJournal({ ...campaign, rounds: 1 }), p = ports('pass'), order: string[] = [];
    p.measure = async (target, protocol, _calibration, deep) => {
      order.push(`${deep ? 'deep' : 'screen'}:${target}:${protocol}`);
      return { protocol, access: { status: 'pass', reason: 'fixture' }, valid: true, outcome: 'qualified' };
    };
    p.cleanupGateway = async () => { order.push('cleanup'); };
    await runCohort(journal, p);
    expect(p.provision).toHaveBeenCalledOnce(); expect(order.filter(v => v.startsWith('deep:'))).toHaveLength(4);
    expect(order.at(-1)).toBe('cleanup');
  });
  it('does not rank pairs across mismatched controls or a long interruption', () => {
    const m: Measurement = { protocol: 'xray' as const, access: { status: 'pass' as const, reason: 'fixture' }, valid: true,
      before: speed(100), after: speed(100), speed: speed(60), measuredAt: '2026-09-27T00:00:00Z' };
    const block = { round: 1, protocol: 'xray' as const, calibration: [], complete: true,
      samples: [{ target: 'source', measurement: m }, { target: 'candidate', measurement: { ...m, speed: speed(90) } }] };
    expect(pairedComparisons([block], 'source')[0]?.result).toBe('candidate-faster');
    block.samples[1]!.measurement = { ...m, before: speed(50) };
    expect(pairedComparisons([block], 'source')[0]?.comparable).toBe(false);
    block.samples[1]!.measurement = { ...m, finishedAt: '2026-09-27T01:00:00Z' };
    expect(pairedComparisons([block], 'source')[0]?.comparable).toBe(false);
    block.samples[1]!.measurement = { ...m, measuredAt: '2026-09-27T01:00:00Z' };
    expect(pairedComparisons([block], 'source')[0]?.comparable).toBe(false);
  });
});

describe('stream modeling and controls', () => {
  it('bounds a stalled browser promise independently of browser timers', async () => {
    vi.useFakeTimers();
    try {
      const result = measurementDeadline(new Promise(() => {}), 30);
      const rejected = expect(result).rejects.toThrow('deadline');
      await vi.advanceTimersByTimeAsync(35_000); await rejected;
      expect(await measurementDeadline(Promise.resolve(7), 30)).toBe(7);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('detects slow and bursty delivery despite a healthy average', () => {
    expect(simulateStream(Array(45).fill(1)).underruns).toBe(0);
    expect(simulateStream(Array(45).fill(6)).stalledSeconds).toBeGreaterThan(0);
    expect(simulateStream([1, 1, 20, 1, 1]).underruns).toBe(1);
    expect(() => simulateStream([NaN])).toThrow();
    expect(simulateStream([1, 1], 4, 8, 20, 20)).toMatchObject({ elapsedSeconds: 20, stalledSeconds: 10, underruns: 1 });
    expect(simulateStream([], 4, 8, 20, 20).startupSeconds).toBe(20);
  });
  it('marks unstable before/after access as invalid without modifying throughput', () => {
    expect(stableControls(speed(100), speed(95), [speed(99), speed(100), speed(101)])).toBe(true);
    expect(stableControls(speed(100), speed(50), [speed(99), speed(100), speed(101)])).toBe(false);
    expect(stableControls(speed(0), speed(0), [])).toBe(false);
    expect(stableControls(speed(100), speed(50), [speed(20), speed(100), speed(180)])).toBe(false);
    expect(stableControls(speed(100), speed(50), [speed(85), speed(100), speed(115)])).toBe(false);
  });
});

describe('minimal prescreen infrastructure', () => {
  it('bounds global bucket names even for long campaign and region identifiers', () => {
    const name = benchmarkBucket('123456789012', 'ap-southeast-6', 'a'.repeat(31), 'code');
    expect(name.length).toBeLessThanOrEqual(63);
    expect(name).not.toBe(benchmarkBucket('123456789012', 'ap-southeast-6', 'a'.repeat(30) + 'b', 'code'));
  });
  it('does not provision network, gateway, EIPs or registries and scopes probe permissions', () => {
    const app = new App();
    const stack = new BenchmarkProbeStack(app, 'Probe', { env: { account: '123456789012', region: 'eu-central-1' }, campaign: 'test', assetPath: 'test/fixtures' });
    const template = Template.fromStack(stack);
    for (const resource of ['AWS::EC2::VPC', 'AWS::EC2::Instance', 'AWS::EC2::EIP', 'AWS::EC2::NatGateway', 'AWS::ECS::Service', 'AWS::ECR::Repository']) template.resourceCountIs(resource, 0);
    template.hasResourceProperties('AWS::Lambda::Function', { Timeout: 60, MemorySize: 2048, Architectures: ['x86_64'] });
    const serialized = JSON.stringify(template.toJSON());
    expect(serialized).not.toContain('ssm:GetParameter'); expect(serialized).not.toContain('VpcConfig');
  });
  it('creates private expiring fixtures without a custom cleanup Lambda', () => {
    const app = new App();
    const stack = new BenchmarkStorageStack(app, 'Fixture', { env: { account: '123456789012', region: 'eu-west-2' }, campaign: 'test', fixture: true });
    const template = Template.fromStack(stack); template.resourceCountIs('AWS::Lambda::Function', 0);
    template.hasResourceProperties('AWS::S3::Bucket', { PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true } });
  });
});
