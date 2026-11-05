// Shared by local builders and cloud controllers; importing identities must never read local build files.
export const applicationArtifacts = ['xray', 'awg', 'gateway-config'] as const;
export type ApplicationArtifact = typeof applicationArtifacts[number];
export const platformArtifacts = ['bootstrap', 'network-daemon'] as const;
export const imageArtifacts = [...applicationArtifacts, ...platformArtifacts] as const;
export type ImageArtifact = typeof imageArtifacts[number];

// Retained v2/v3 documents describe exactly this five-image set even after new artifacts join releases.
export const legacyReleaseArtifacts = ['xray', 'awg', 'gateway-config', 'bootstrap', 'network-daemon'] as const;
export const dnsReleaseArtifacts = [...legacyReleaseArtifacts, 'dns-policy'] as const;
export type BuildArtifact = ImageArtifact | 'dns-policy';
