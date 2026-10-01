// Observed upstream availability limitation; it grants no automatic reboot or retry authority.
export const bootstrapRaceIssue = 'https://github.com/bottlerocket-os/bottlerocket-core-kit/issues/1059';
export const bootstrapRaceVersions = ['1.65.0', '1.66.0'] as const;

export function hasKnownBootstrapRace(version: string | undefined): boolean {
  // New versions need explicit qualification before their evidence can describe this known defect.
  return version !== undefined && bootstrapRaceVersions.some(affected => affected === version);
}
