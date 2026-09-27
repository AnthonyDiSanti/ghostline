import type { AccessResult, ComparisonBlock, Journal, Measurement, RegionRecord, Speed } from './model.js';

export interface CohortPorts {
  save(): void;
  probe(record: RegionRecord): Promise<AccessResult>;
  cleanupProbe(record: RegionRecord): Promise<void>;
  provision(record: RegionRecord): Promise<unknown>;
  prepare(target: string): Promise<void>;
  calibrate(): Promise<Speed[]>;
  measure(target: string, protocol: 'xray' | 'awg', calibration: Speed[], deep: boolean): Promise<Measurement>;
  cleanupGateway(record: RegionRecord): Promise<void>;
  cleanupFixture(): Promise<void>;
}
export function schedule(targets: string[], rounds: number): { round: number; protocol: 'xray' | 'awg'; targets: string[] }[] {
  // Reverse both axes on alternate rounds to balance order and time-of-day effects.
  return Array.from({ length: rounds }, (_, i) => {
    const protocols: ('xray' | 'awg')[] = i % 2 ? ['awg', 'xray'] : ['xray', 'awg'];
    return protocols.map(protocol => ({ round: i + 1, protocol, targets: i % 2 ? [...targets].reverse() : [...targets] }));
  }).flat();
}
export function pairedComparisons(blocks: ComparisonBlock[], source: string) {
  // Compare raw rates only inside a matched protocol/round with similar direct-path conditions.
  return blocks.flatMap(block => {
    const baseline = block.samples.find(s => s.target === source)?.measurement;
    return block.samples.filter(s => s.target !== source).map(({ target, measurement: m }) => {
      const controls = [baseline?.before, baseline?.after, m.before, m.after];
      const rates = controls.map(s => s?.mbps ?? 0);
      const starts = [m.measuredAt, baseline?.measuredAt].map(t => Date.parse(t ?? ''));
      const ends = [m.finishedAt ?? m.measuredAt, baseline?.finishedAt ?? baseline?.measuredAt].map(t => Date.parse(t ?? ''));
      const gap = Math.max(...ends) - Math.min(...starts);
      const comparable = block.complete && !!baseline?.valid && !!m.valid && rates.every(v => v > 0)
        && (Math.max(...rates) - Math.min(...rates)) / Math.max(...rates) <= 0.2 && ends.every((end, i) => end >= starts[i]!) && gap <= 15 * 60_000;
      const ratio = comparable && baseline?.speed?.mbps ? m.speed!.mbps / baseline.speed.mbps : undefined;
      return { round: block.round, protocol: block.protocol, target, comparable, ratio,
        result: ratio === undefined ? 'inconclusive' : ratio > 1.2 ? 'candidate-faster' : ratio < 1 / 1.2 ? 'source-faster' : 'similar' };
    });
  });
}
export function requestCleanup(journal: Journal): void {
  // Explicit cleanup retires a partial campaign; a later resume must never recreate its deleted resources.
  if (journal.version !== 2) return;
  const state = journal.cohort ??= { phase: 'probes', blocks: [], deep: [] };
  if (!['complete', 'failed'].includes(state.phase)) {
    state.phase = 'cleanup'; state.failure ??= 'Campaign explicitly cleaned up before completion.';
  }
}
export async function runCohort(journal: Journal, p: CohortPorts): Promise<void> {
  // Cleanup is a durable phase: a resumed deletion never starts another gateway or repeats measurements.
  const state = journal.cohort ??= { phase: 'probes', blocks: [], deep: [] };
  if (state.phase === 'complete') return;
  if (state.phase === 'failed') throw new Error('Campaign already failed and was cleaned up; use a new campaign to retry.');
  try {
    if (state.phase === 'probes') {
      for (const r of journal.records) {
        r.phase = 'probe'; p.save();
        r.access ??= await p.probe(r); p.save();
        await p.cleanupProbe(r);
        r.phase = r.access.status === 'pass' ? 'screen' : 'done'; p.save();
      }
      state.phase = 'provision'; p.save();
    }
    if (state.phase === 'provision') {
      for (const r of journal.records.filter(r => r.access?.status === 'pass')) await p.provision(r);
      state.phase = 'measure'; p.save();
    }
    const candidates = journal.records.filter(r => r.access?.status === 'pass').map(r => r.target!);
    const targets = candidates.length ? [journal.campaign.source, ...candidates] : [];
    if (state.phase === 'measure') {
      // All fixture preparation/profile export/image pulls finish before the first timed block, including after a process restart.
      for (const target of targets) await p.prepare(target);
      for (const entry of schedule(targets, journal.campaign.rounds ?? 2)) {
        if (!targets.length) break;
        let block = [...state.blocks].reverse().find(b => b.round === entry.round && b.protocol === entry.protocol);
        if (block?.complete) continue;
        // An interrupted block is preserved as incomplete evidence; rerun the entire time-matched block.
        block = { round: entry.round, protocol: entry.protocol, calibration: await p.calibrate(), samples: [], complete: false };
        state.blocks.push(block); p.save();
        for (const target of entry.targets) {
          const measurement = await p.measure(target, entry.protocol, block.calibration, false);
          block.samples.push({ target, measurement }); p.save();
        }
        block.complete = true; p.save();
      }
      state.phase = 'deep'; p.save();
    }
    if (state.phase === 'deep') {
      // Keep qualified contenders online; never pay for a second deployment solely for streaming tests.
      const qualified = targets.flatMap(target => (['xray', 'awg'] as const).filter(protocol =>
        state.blocks.some(b => b.complete && b.samples.some(s => s.target === target && s.measurement.protocol === protocol
          && s.measurement.valid && s.measurement.outcome === 'qualified'))).map(protocol => ({ target, protocol })));
      for (const { target, protocol } of qualified) {
        if (state.deep.some(s => s.target === target && s.measurement.protocol === protocol)) continue;
        await p.prepare(target);
        state.deep.push({ target, measurement: await p.measure(target, protocol, await p.calibrate(), true) }); p.save();
      }
      state.phase = 'cleanup'; p.save();
    }
  } catch {
    // Provider errors can contain signed URLs or private content; retain only a bounded phase label.
    state.failure = `Campaign failed during ${state.phase}; measurements are incomplete.`;
    state.phase = 'cleanup'; p.save();
  }
  if (state.phase === 'cleanup') {
    for (const r of journal.records) {
      r.phase = 'cleanup'; p.save(); await p.cleanupProbe(r); await p.cleanupGateway(r); r.phase = 'done'; p.save();
    }
    await p.cleanupFixture(); state.phase = state.failure ? 'failed' : 'complete'; journal.complete = true; p.save();
  }
  if (state.failure) throw new Error(`${state.failure} Cleanup completed; use a new campaign to retry.`);
}
