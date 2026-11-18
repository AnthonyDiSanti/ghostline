// Shared by local builders and cloud controllers; importing identities must never read local build files.
export const applicationArtifacts = ['xray', 'awg', 'gateway-config'] as const;
export type ApplicationArtifact = typeof applicationArtifacts[number];
export const platformArtifacts = ['bootstrap', 'network-daemon'] as const;
export const imageArtifacts = [...applicationArtifacts, ...platformArtifacts] as const;
export type ImageArtifact = typeof imageArtifacts[number];

// Retained v2/v3 documents describe exactly this five-image set even after new artifacts join releases.
export const legacyReleaseArtifacts = ['xray', 'awg', 'gateway-config', 'bootstrap', 'network-daemon'] as const;
export const dnsReleaseArtifacts = [...legacyReleaseArtifacts, 'dns-policy'] as const;
export const derpReleaseArtifacts = [...dnsReleaseArtifacts, 'derp'] as const;
export type BuildArtifact = ImageArtifact | 'dns-policy' | 'derp';

export function configuredArtifacts(config: { dnsRequired?: boolean; derp?: unknown }): readonly BuildArtifact[] {
  // One exact product shape feeds builders, publication and native qualification; historical sets remain immutable.
  return config.derp ? derpReleaseArtifacts : config.dnsRequired ? dnsReleaseArtifacts : legacyReleaseArtifacts;
}
