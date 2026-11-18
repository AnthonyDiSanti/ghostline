import { digest, digestPattern, emptyConfig, manifestType, parseRelease, releaseArtifacts, releaseRepository, repository, type Release } from './model.js';
import { readRelease, runtimeManifest, type Manifest, type Registry, type ReleaseRecord } from './registry.js';
import type { Generation } from './blue-green.js';
import { readActiveTrial, type ActiveTrial } from './trial-exclusions.js';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';

export const candidateType = 'application/vnd.ghostline.trial.v1+json';
const annotation = 'io.ghostline.trial';

export interface TrialCandidate {
  schema: 1;
  kind: 'native-qualification';
  target: string;
  account: string;
  region: string;
  createdAt: string;
  localQualifiedAt: string;
  sourceInputs: Record<string, string>;
  frameworkDigest: string;
  // This is an expected runtime contract, not a claim of native compatibility.
  intent: Release;
}

export interface CandidateTrial extends ActiveTrial {
  kind: 'candidate';
  account: string;
  region: string;
  endpoint: string;
  baseline: Generation;
  baselineRelease: string;
  originalMode: 'active' | 'manual';
  phase: 'prepared' | 'deploying' | 'testing' | 'returning';
  endpointTemplate: string;
  endpointParameters: Record<string, string>;
  releaseTemplate: string;
  releaseParameters: Record<string, string>;
  baselineTemplates: Record<'a' | 'b' | 'addresses', string>;
}

export function parseCandidate(value: unknown): TrialCandidate {
  // An unqualified artifact has a distinct media type and cannot be consumed by the production release parser.
  const candidate = value as TrialCandidate;
  if (!candidate || candidate.schema !== 1 || candidate.kind !== 'native-qualification'
    || !/^[a-z][a-z0-9-]{0,80}$/.test(candidate.target) || !/^\d{12}$/.test(candidate.account)
    || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(candidate.region)
    || !Number.isFinite(Date.parse(candidate.createdAt)) || !Number.isFinite(Date.parse(candidate.localQualifiedAt))
    || !digestPattern.test(candidate.frameworkDigest)
    || Object.keys(candidate).sort().join(',') !== 'account,createdAt,frameworkDigest,intent,kind,localQualifiedAt,region,schema,sourceInputs,target') {
    throw new Error('Invalid native trial candidate.');
  }
  const intent = parseRelease(candidate.intent);
  const names = releaseArtifacts(intent);
  if (intent.origin !== candidate.region || !candidate.sourceInputs
    || Object.keys(candidate.sourceInputs).sort().join(',') !== [...names].sort().join(',')
    || names.some(name => !/^sha-[a-f0-9]{64}$/.test(candidate.sourceInputs[name] ?? ''))) {
    throw new Error('Trial candidate source/region contract is incomplete.');
  }
  return candidate;
}

export function capturedTrialTemplates(trial: CandidateTrial, scope: { account: string; region: string; endpoint: string }) {
  // A return may use only captured immutable assets from this account's regional release bucket.
  if (trial.account !== scope.account || trial.region !== scope.region || trial.endpoint !== scope.endpoint) throw new Error('Trial template scope mismatch.');
  if (Object.keys(trial.baselineTemplates ?? {}).sort().join(',') !== 'a,addresses,b') throw new Error('Captured host template set is incomplete.');
  for (const name of ['a', 'b', 'addresses'] as const) {
    const value = trial.baselineTemplates?.[name];
    assertTrialTemplateUrl(value, scope);
  }
  return trial.baselineTemplates;
}

export async function trialHostTemplates(defaults: Record<'a' | 'b' | 'addresses', string>,
  db: Pick<DynamoDBClient, 'send'>, table: string, scope: { account: string; region: string; endpoint: string }) {
  // Return uses the captured recipe, even when the candidate changes the host's bootstrap contract.
  const trial = await readActiveTrial(db, table) as CandidateTrial | undefined;
  return trial?.kind === 'candidate' && trial.phase === 'returning' ? capturedTrialTemplates(trial, scope) : defaults;
}

export function assertTrialTemplateUrl(value: string, scope: { account: string; region: string }): void {
  // Accept both CDK regional S3 URL shapes, with no query/credential/redirect authority.
  const url = new URL(value), bucket = `ghostline-release-assets-${scope.account}-${scope.region}`;
  const virtual = url.hostname === `${bucket}.s3.${scope.region}.amazonaws.com`;
  const regional = url.hostname === `s3.${scope.region}.amazonaws.com`;
  const path = regional ? url.pathname.slice(`/${bucket}/`.length) : url.pathname.slice(1);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || !virtual && !(regional && url.pathname.startsWith(`/${bucket}/`)) || !/^[a-f0-9]{64}\.json$/.test(path)) {
    throw new Error('Trial template is not an immutable owned regional asset.');
  }
}

export function candidateManifest(value: TrialCandidate): Manifest {
  // Bind the complete local proof and expected image set to one immutable ECR artifact.
  const document = JSON.stringify(parseCandidate(value));
  const manifest = JSON.stringify({ schemaVersion: 2, mediaType: manifestType, artifactType: candidateType,
    config: { mediaType: 'application/vnd.oci.empty.v1+json', digest: digest(emptyConfig), size: emptyConfig.length },
    layers: [{ mediaType: candidateType, digest: digest(document), size: Buffer.byteLength(document) }],
    annotations: { [annotation]: document } });
  return { digest: digest(manifest), manifest, mediaType: manifestType };
}

export function readCandidate(manifest: Manifest): TrialCandidate {
  // Verify both checksum boundaries before interpreting any candidate fields.
  const value = JSON.parse(manifest.manifest), document = value.annotations?.[annotation];
  if (digest(manifest.manifest) !== manifest.digest || value.schemaVersion !== 2 || value.mediaType !== manifestType
    || value.artifactType !== candidateType || value.subject || typeof document !== 'string'
    || value.layers?.length !== 1 || value.layers[0].mediaType !== candidateType
    || value.layers[0].digest !== digest(document) || value.layers[0].size !== Buffer.byteLength(document)) {
    throw new Error('Native candidate artifact checksum/type mismatch.');
  }
  return parseCandidate(JSON.parse(document));
}

export async function immutableReadiness(registry: Registry, current: ReleaseRecord, dnsRequired: boolean, derpRequired: boolean) {
  // Trial images resolve only by digest. Production keep aliases are never rewritten or impersonated.
  const expectedSchema = derpRequired ? 5 : dnsRequired ? 4 : 3;
  if (current.release.schemaVersion !== expectedSchema) throw new Error('Candidate schema differs from the target.');
  for (const name of releaseArtifacts(current.release)) {
    const expected = current.release.images[name]!;
    const image = await registry.get(repository(name), expected.digest);
    if (!image || (await runtimeManifest(registry, repository(name), image)).digest !== expected.runtimeDigest) {
      return { current, ready: false, reason: `${name} immutable trial image is unavailable.` };
    }
  }
  return { current, ready: true };
}

export async function candidateReadiness(ports: {
  registry: Registry; dnsRequired: boolean; derpRequired?: boolean;
  trialScope?: { account: string; region: string; endpoint: string };
  record<T>(key: string): Promise<T | undefined>;
}) {
  // Only an explicit active regional trial can override production selection; ordinary paths stay unchanged.
  const trial = await ports.record<ActiveTrial & Partial<CandidateTrial>>('trial/current');
  if (trial?.kind !== 'candidate') return undefined;
  if (!['prepared', 'deploying', 'testing', 'returning'].includes(trial.phase) || !digestPattern.test(trial.candidate)
    || !trial.baselineRelease || !digestPattern.test(trial.baselineRelease)) throw new Error('Invalid candidate trial selection.');
  const scope = ports.trialScope;
  if (!scope || trial.account !== scope.account || trial.region !== scope.region || trial.endpoint !== scope.endpoint) {
    throw new Error('Candidate trial does not belong to this controller.');
  }
  if (trial.phase === 'prepared') return { ready: false, reason: 'Candidate deployment has not been explicitly authorized.' };
  if (trial.phase === 'returning') {
    const baseline = await readRelease(ports.registry, releaseRepository, trial.baselineRelease);
    if (!baseline) throw new Error('Captured production return release is unavailable.');
    return immutableReadiness(ports.registry, baseline, ports.dnsRequired, !!ports.derpRequired);
  }
  const artifact = await ports.registry.get(releaseRepository, trial.candidate);
  if (!artifact) throw new Error('Pinned trial candidate is unavailable.');
  const candidate = readCandidate(artifact);
  if (candidate.target !== trial.target || candidate.account !== trial.account || candidate.region !== trial.region) {
    throw new Error('Candidate belongs to a different regional trial.');
  }
  return immutableReadiness(ports.registry, { digest: artifact.digest, release: candidate.intent }, ports.dnsRequired, !!ports.derpRequired);
}
