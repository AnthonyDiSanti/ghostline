// Temporary availability exception for core-kit #1059. Remove after the official repair is adopted.
export const bootstrapRecoveryIssue = 'https://github.com/bottlerocket-os/bottlerocket-core-kit/issues/1059';
export const bootstrapRecoveryVersions = ['1.65.0', '1.66.0'] as const;

export function acceptsBootstrapRecovery(version: string | undefined): boolean {
  // An unknown/new OS never inherits permission to conceal a new boot failure with a retry.
  return version !== undefined && bootstrapRecoveryVersions.some(affected => affected === version);
}
