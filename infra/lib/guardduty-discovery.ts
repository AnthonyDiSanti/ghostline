import { execFileSync } from 'node:child_process';
import type { DeploymentConfig } from './config.js';

export interface GuardDutySupport { service: boolean; runtime: boolean }
export type RegionalMetadata = (args: string[], region: string) => any;

export function regionalMetadata(args: string[], region: string): any {
  // Discovery reads public/service metadata only; errors must not become an unsupported-region verdict.
  const value = execFileSync('aws', ['--profile', 'personal', '--region', region, ...args, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(value);
}

export function discoverGuardDuty(config: Pick<DeploymentConfig, 'region' | 'availabilityZone'>,
  aws: RegionalMetadata = regionalMetadata): GuardDutySupport {
  // AWS publishes this catalog only in selected query regions. Query it live from our existing preflight region.
  const path = '/aws/service/global-infrastructure/services/guardduty/regions';
  const response = aws(['ssm', 'get-parameters-by-path', '--path', path], 'eu-central-1');
  const entries = response.Parameters;
  if (response.NextToken || !Array.isArray(entries) || !entries.length || entries.some(entry =>
    typeof entry.Value !== 'string' || entry.Name !== `${path}/${entry.Value}`)) {
    throw new Error('Incomplete GuardDuty service catalog; cannot determine regional availability.');
  }
  if (!entries.some(entry => entry.Value === config.region)) return { service: false, runtime: false };

  // PrivateLink is a live prerequisite for EC2 telemetry; never synthesize an unavailable endpoint service.
  const service = `com.amazonaws.${config.region}.guardduty-data`;
  const endpoints = aws(['ec2', 'describe-vpc-endpoint-services', '--filters', `Name=service-name,Values=${service}`], config.region);
  if (endpoints.NextToken || !Array.isArray(endpoints.ServiceDetails)) {
    throw new Error('Incomplete GuardDuty telemetry discovery; cannot determine runtime availability.');
  }
  const runtime = endpoints.ServiceDetails.some((item: any) => item.ServiceName === service && item.Owner === 'amazon'
    && item.ServiceType?.some((type: any) => type.ServiceType === 'Interface')
    && item.AvailabilityZones?.includes(config.availabilityZone));
  return { service: true, runtime };
}
