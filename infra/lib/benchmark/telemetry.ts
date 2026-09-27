export interface HostSample { instanceType?: string; ami?: string; cpuMaximumPercent?: number; cpuCreditMinimum?: number;
  metrics: 'observed' | 'pending-or-unavailable'; windowStart: string; windowEnd: string }
export function hostSample(instance: string, start: Date, aws: (args: string[]) => any): HostSample {
  const end = new Date(), sample: HostSample = { metrics: 'pending-or-unavailable', windowStart: start.toISOString(), windowEnd: end.toISOString() };
  // These read-only metrics can arrive after a short trial. Missing points must never be reported as zero utilization.
  const host = aws(['ec2', 'describe-instances', '--instance-ids', instance]).Reservations?.flatMap((r: any) => r.Instances ?? []);
  if (host?.length !== 1 || host[0].InstanceId !== instance) throw new Error('Benchmark host identity changed.');
  sample.instanceType = host[0].InstanceType; sample.ami = host[0].ImageId;
  for (const [name, statistic, field] of [['CPUUtilization', 'Maximum', 'cpuMaximumPercent'], ['CPUCreditBalance', 'Minimum', 'cpuCreditMinimum']] as const) {
    try {
      const response = aws(['cloudwatch', 'get-metric-statistics', '--namespace', 'AWS/EC2', '--metric-name', name,
        '--dimensions', `Name=InstanceId,Value=${instance}`, '--start-time', start.toISOString(), '--end-time', end.toISOString(),
        '--period', '60', '--statistics', statistic]);
      const points = (response.Datapoints ?? []).filter((p: any) => new Date(p.Timestamp).getTime() >= start.getTime()
        && new Date(p.Timestamp).getTime() <= end.getTime()).map((p: any) => p[statistic]).filter(Number.isFinite);
      if (points.length) { sample[field] = statistic === 'Maximum' ? Math.max(...points) : Math.min(...points); sample.metrics = 'observed'; }
    } catch { /* Optional delayed telemetry stays explicitly unavailable; access failure is never a zero-load observation. */ }
  }
  return sample;
}
