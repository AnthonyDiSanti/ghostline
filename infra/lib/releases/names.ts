export const releaseStackName = 'GhostlineRelease';
export const gateName = 'ghostline-prod-release-gate';
export const hookName = 'ghostline-prod-deployment-hook';
export const tableName = 'ghostline-prod-release-attempts';
export const emailParameter = '/ghostline/prod/alerts/email';
export const observerDocumentName = 'GhostlineObserveHost';
export const progressRuleName = 'ghostline-prod-release-progress';
export const assetStackName = 'GhostlineReleaseAssets';
export const assetBucketName = (account: string, region: string) => `ghostline-release-assets-${account}-${region}`;
