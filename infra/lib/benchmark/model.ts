import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HostSample } from './telemetry.js';

export type AccessStatus = 'pass' | 'restricted' | 'transport-failure' | 'inconclusive';
export interface AccessResult { status: AccessStatus; reason: string; httpStatus?: number }
export interface Canary { url: string; expectedText: string; requiredSelector?: string }
export interface Campaign { id: string; regions: string[]; canary: Canary; source: string; rounds?: number }
export interface Speed { accounting?: 'streamed-v2'; completedRequests?: number; mbps: number; bytes: number; seconds: number; limited: boolean; latencyMs?: number;
  loadedLatencyMs?: number; jitterMs?: number; provider?: string; edges?: string[] }
export interface Measurement { protocol: 'xray' | 'awg'; access: AccessResult; before?: Speed; speed?: Speed; after?: Speed;
  router?: { samples: number; medianMs?: number; lossPercent?: number }; confirmation?: Speed; valid?: boolean; outcome?: string; streaming?: StreamResult; release?: string; exit?: string;
  measuredAt?: string; finishedAt?: string; controlWindowSeconds?: number; browserVersion?: string; images?: Record<string, string>; host?: HostSample; calibration?: Speed[];
  confirmationControls?: { before: Speed; after: Speed; windowSeconds?: number }; streamingControls?: { before: Speed; after: Speed; windowSeconds?: number } }
export interface StreamResult { startupSeconds: number; underruns: number; stalledSeconds: number; segments: number; elapsedSeconds: number }
export interface RegionRecord { region: string; phase: 'pending' | 'probe' | 'screen' | 'cleanup' | 'done';
  access?: AccessResult; target?: string; measurements?: Measurement[]; error?: string; stacks?: Record<string, string> }
export interface Journal { version: 2; owner: string; campaign: Campaign; records: RegionRecord[]; baseline?: Measurement[]; releaseDigest?: string; catalogHash?: string;
  fixture?: boolean; fixtureStacks?: Record<string, string>; complete?: boolean; localClients?: boolean; cohort?: CohortState }

export function validateCampaign(value: unknown): Campaign {
  // Reject accidental options and URL credentials before any provider or browser sees the input.
  const c = value as Campaign;
  if (!c || Object.keys(c).some(k => !['id', 'regions', 'canary', 'source', 'rounds'].includes(k))
    || !/^[a-z][a-z0-9-]{0,30}$/.test(c.id ?? '') || !Array.isArray(c.regions) || !c.regions.length || c.regions.length > 12
    || new Set(c.regions).size !== c.regions.length || c.regions.some(r => !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(r))
    || (c.rounds !== undefined && (!Number.isInteger(c.rounds) || c.rounds < 1 || c.rounds > 3))
    || !/^[a-z][a-z0-9-]*$/.test(c.source ?? '') || !c.canary || Object.keys(c.canary).some(k => !['url', 'expectedText', 'requiredSelector'].includes(k))) throw new Error('Invalid benchmark campaign.');
  const url = new URL(c.canary.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)
    || !c.canary.expectedText?.trim() || c.canary.expectedText.length > 200 || (c.canary.requiredSelector?.length ?? 0) > 200) throw new Error('Invalid private canary.');
  return c;
}
export function createJournal(campaign: Campaign): Journal {
  return { version: 2, owner: randomUUID(), campaign, records: campaign.regions.map(region => ({ region, phase: 'pending' })) };
}
export function saveJson(path: string, value: unknown): void {
  // Atomic checkpoints make cloud cleanup recoverable after process death; restrictive modes also protect private canaries.
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}
export function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, 'utf8')) as T; }
export function classifyAccess(status: number, text: string, expected: boolean): AccessResult {
  // A WAF challenge is not geographic filtering; generic age/membership links do not establish a forced gate.
  const challenge = /verify (?:that )?you are human|checking your browser|just a moment|captcha|access denied|request blocked/i.test(text);
  if (challenge) return { status: 'inconclusive', reason: 'challenge-or-ip-restriction', httpStatus: status };
  if (/not available in your (?:country|region|location)|blocked in your (?:country|region)|unavailable in your jurisdiction/i.test(text)) {
    return { status: 'restricted', reason: 'explicit-geographic-restriction', httpStatus: status };
  }
  if (!expected && /(?:verify your (?:age|identity)|age verification).{0,160}(?:required|continue|sign up|identity|document)/is.test(text)) {
    return { status: 'restricted', reason: 'verification-gate', httpStatus: status };
  }
  if (status >= 200 && status < 400 && expected) return { status: 'pass', reason: 'expected-content', httpStatus: status };
  return { status: status >= 500 ? 'transport-failure' : 'inconclusive', reason: 'expected-content-not-confirmed', httpStatus: status };
}
const median = (values: number[]) => { const a = [...values].sort((a,b) => a-b); return a.length ? a[Math.floor(a.length / 2)]! : 0; };
export function stableControls(before: Speed, after: Speed, baseline: Speed[]): boolean {
  // A noisy calibration cannot excuse arbitrary variation. Defer the attempt instead of normalizing away poor access.
  const center = median(baseline.map(s => s.mbps));
  const mad = median(baseline.map(s => Math.abs(s.mbps - center)));
  if (!center || mad / center > 0.15) return false;
  return before.mbps > 0 && after.mbps > 0 && Math.abs(before.mbps - after.mbps) / Math.max(before.mbps, after.mbps) <= Math.min(0.3, Math.max(0.2, 3 * mad / center));
}
export function simulateStream(durations: number[], segmentSeconds = 4, startupBuffer = 8, maxBuffer = 20, observedSeconds?: number): StreamResult {
  // Download timings replay into a bounded player buffer; these are modeled, not observed browser stalls.
  let buffer = 0, elapsed = 0, startup = 0, stalls = 0, underruns = 0, started = false;
  for (const duration of durations) {
    if (!Number.isFinite(duration) || duration < 0) throw new Error('Invalid segment duration.');
    if (started && buffer > maxBuffer - segmentSeconds) { const wait = buffer - (maxBuffer - segmentSeconds); buffer -= wait; elapsed += wait; }
    elapsed += duration;
    if (started) { if (duration > buffer) { stalls += duration - buffer; underruns++; } buffer = Math.max(0, buffer - duration); }
    buffer += segmentSeconds;
    if (!started && buffer >= startupBuffer) { started = true; startup = elapsed; }
  }
  // Count the uncompleted final request/window too; omitting it would hide end-of-test starvation.
  if (observedSeconds !== undefined) {
    if (!Number.isFinite(observedSeconds) || observedSeconds < 0) throw new Error('Invalid observation window.');
    const tail = Math.max(0, observedSeconds - elapsed);
    if (started && tail > buffer) { stalls += tail - buffer; underruns++; }
    elapsed = Math.max(elapsed, observedSeconds);
  }
  return { startupSeconds: started ? startup : elapsed, underruns, stalledSeconds: stalls, segments: durations.length, elapsedSeconds: elapsed };
}
export interface ComparisonSample { target: string; measurement: Measurement }
export interface ComparisonBlock { round: number; protocol: 'xray' | 'awg'; calibration: Speed[]; samples: ComparisonSample[]; complete: boolean }
export interface CohortState { phase: 'probes' | 'provision' | 'measure' | 'deep' | 'cleanup' | 'complete' | 'failed';
  blocks: ComparisonBlock[]; deep: ComparisonSample[]; failure?: string }
