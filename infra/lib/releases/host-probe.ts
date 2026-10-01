import { SendCommandCommand, GetCommandInvocationCommand, type SSMClient } from '@aws-sdk/client-ssm';
import { parseHostObservation, type HostObservation } from '../platform-observation.js';

interface Probe { host: string; command: string; requestedAt: number }
export interface ProbeState {
  now(): number;
  record<T>(key: string): Promise<T | undefined>;
  put(key: string, record: unknown): Promise<void>;
}
export class HostProbe {
  constructor(readonly document: string, readonly ssm: Pick<SSMClient, 'send'>, readonly state: ProbeState,
    readonly wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {}
  async read(host: string): Promise<HostObservation | undefined> {
    const key = `probe/${host}`;
    const previous = await this.state.record<Probe>(key);
    if (previous?.host === host && this.state.now() - previous.requestedAt < 120_000) {
      const found = await this.result(previous);
      if (found !== 'expired') return found;
    }
    // A fixed parameterless document has no host mutation or secret authority; losing a read acknowledgement is harmless.
    const response = await this.ssm.send(new SendCommandCommand({ DocumentName: this.document, InstanceIds: [host],
      TimeoutSeconds: 30, Comment: 'Ghostline generation readiness observation' })).catch(error => {
      // ECS can register before SSM, and management transport can reconnect during EIP handoff. Missing observation is not failed health.
      if (error.name === 'InvalidInstanceId') return undefined;
      throw error;
    });
    if (!response) return undefined;
    if (!response.Command?.CommandId) throw new Error('Host probe command identity missing.');
    const next = { host, command: response.Command.CommandId, requestedAt: this.state.now() } satisfies Probe;
    await this.state.put(key, next);
    // Bounded polling keeps readiness useful for minute-based bake monitoring. Slow SSM continues on the next callback.
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.wait(2_000);
      const found = await this.result(next);
      if (found && found !== 'expired') return found;
    }
    return undefined;
  }
  private async result(probe: Probe): Promise<HostObservation | 'expired' | undefined> {
    const value = await this.ssm.send(new GetCommandInvocationCommand({ InstanceId: probe.host, CommandId: probe.command }))
      .catch(error => { if (error.name === 'InvocationDoesNotExist') return undefined; throw error; });
    if (!value || ['Pending', 'InProgress', 'Delayed'].includes(value.Status ?? '')) return undefined;
    if (value.Status !== 'Success') return 'expired';
    if (value.DocumentName !== this.document) throw new Error('Unexpected host-observer document.');
    const end = Date.parse(value.ExecutionEndDateTime ?? '');
    // Delayed delivery is fine; old readiness is not. Never substitute current aliases for a missing runtime observation.
    if (!Number.isFinite(end) || end > this.state.now() + 1_000 || this.state.now() - end > 10_000) return 'expired';
    return parseHostObservation(value.StandardOutputContent ?? '');
  }
}
