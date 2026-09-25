// Shared by local builders and cloud controllers; importing identities must never read local build files.
export const applicationArtifacts = ['xray', 'awg', 'gateway-config'] as const;
export type ApplicationArtifact = typeof applicationArtifacts[number];
export const platformArtifacts = ['bootstrap', 'network-daemon'] as const;
export const imageArtifacts = [...applicationArtifacts, ...platformArtifacts] as const;
export type ImageArtifact = typeof imageArtifacts[number];
