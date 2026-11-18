import type { Instance } from '@aws-sdk/client-ec2';

export const gatewayRuntimeEnrollmentTag = 'GuardDutyManaged';
const agent = 'amazon-guardduty-agent';

export async function verifyGatewayRuntimeOptOut(instance: Pick<Instance, 'Tags' | 'MetadataOptions'>,
  remote: (command: string) => Promise<string>) {
  if (!instance.Tags?.some(tag => tag.Key === gatewayRuntimeEnrollmentTag && tag.Value === 'false')) {
    throw new Error('Gateway lacks the Runtime Monitoring exclusion tag.');
  }
  const imds = instance.MetadataOptions;
  if (imds?.InstanceMetadataTags !== 'enabled' || imds.HttpTokens !== 'required' || imds.HttpPutResponseHopLimit !== 1) {
    throw new Error('Gateway must expose the exclusion tag through host-scoped IMDSv2.');
  }
  // The exclusion tag controls future enrollment. Check actual Bottlerocket settings for an already-installed agent.
  const response = JSON.parse(await remote('apiclient get settings.host-containers'));
  const containers = response?.settings?.['host-containers'];
  if (!containers || typeof containers !== 'object' || Array.isArray(containers) || !containers.control) {
    throw new Error('Missing Bottlerocket host-container settings.');
  }
  if (Object.hasOwn(containers, agent) && containers[agent]?.enabled !== false) {
    throw new Error('Gateway GuardDuty host agent is enabled or its state is unknown.');
  }
  return { status: 'RUNTIME_OPTED_OUT' as const, enrollmentExcluded: true, metadataTagsEnabled: true, agentEnabled: false };
}
