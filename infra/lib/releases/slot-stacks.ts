import { createHash } from 'node:crypto';
import { CreateStackCommand, DeleteStackCommand, DescribeStacksCommand, ListStackResourcesCommand, UpdateStackCommand,
  type CloudFormationClient, type Stack } from '@aws-sdk/client-cloudformation';
import { slotStackName, transitionAddressStackName, type SlotPhase } from '../host-slot-model.js';
import type { HostSlot } from '../host-slot-model.js';

export interface SlotStackConfig {
  endpoint: string; account: string; region: string; role: string;
  templates: Record<HostSlot | 'addresses', string>;
  tags: Record<string, string>;
}
export interface SlotInputs { subnet: string; security: string; profile: string; execution: string }
export interface OwnedStack { id: string; status: string; updatedAt?: string; template?: string; outputs: Record<string, string>; parameters: Record<string, string>; resources: Record<string, string> }

export class SlotStacks {
  constructor(readonly config: SlotStackConfig, readonly cfn: Pick<CloudFormationClient, 'send'>) {}
  get template() { return createHash('sha256').update(JSON.stringify(this.config.templates)).digest('hex'); }
  name(slot: HostSlot | 'addresses') {
    return slot === 'addresses' ? transitionAddressStackName(this.config.endpoint) : slotStackName(this.config.endpoint, slot);
  }
  async observe(slot: HostSlot | 'addresses'): Promise<OwnedStack | undefined> {
    let stacks: Stack[];
    try { stacks = (await this.cfn.send(new DescribeStacksCommand({ StackName: this.name(slot) }))).Stacks ?? []; }
    catch (error) {
      // A denied read or arbitrary validation failure is not an absent resource and cannot authorize a new stack.
      if ((error as Error).name === 'ValidationError' && /Stack with id .+ does not exist/.test((error as Error).message)) return undefined;
      throw error;
    }
    const stack = stacks[0];
    const prefix = `arn:aws:cloudformation:${this.config.region}:${this.config.account}:stack/${this.name(slot)}/`;
    if (stacks.length !== 1 || !stack?.StackId?.startsWith(prefix) || stack.StackName !== this.name(slot) || !stack.StackStatus
      || Object.entries(this.config.tags).some(([Key, Value]) => !stack.Tags?.some(tag => tag.Key === Key && tag.Value === Value))) {
      throw new Error('Host-slot stack ownership is incomplete or unexpected.');
    }
    if (stack.StackStatus === 'DELETE_COMPLETE') return undefined;
    const resources: Record<string, string> = {};
    let NextToken: string | undefined;
    do {
      const page = await this.cfn.send(new ListStackResourcesCommand({ StackName: stack.StackId, NextToken }));
      if (!page.StackResourceSummaries) throw new Error('Host-slot resource inventory is incomplete.');
      for (const r of page.StackResourceSummaries) {
        if (!r.LogicalResourceId || !r.ResourceStatus) throw new Error('Host-slot resource identity/status is missing.');
        if (r.PhysicalResourceId && r.ResourceStatus !== 'DELETE_COMPLETE') resources[r.LogicalResourceId] = r.PhysicalResourceId;
      }
      NextToken = page.NextToken;
    } while (NextToken);
    return { id: stack.StackId, status: stack.StackStatus, updatedAt: (stack.LastUpdatedTime ?? stack.CreationTime)?.toISOString(), template: stack.Tags?.find(t => t.Key === 'GhostlineTemplate')?.Value,
      resources,
      outputs: Object.fromEntries((stack.Outputs ?? []).map(o => [o.OutputKey!, o.OutputValue!])),
      parameters: Object.fromEntries((stack.Parameters ?? []).map(p => [p.ParameterKey!, p.ParameterValue!])) };
  }
  async ensure(slot: HostSlot, phase: SlotPhase, os: string, inputs: SlotInputs, operation: string, resumeFailed = false): Promise<void> {
    // The only variable host settings are typed lifecycle coordinates; executable template bytes are immutable CDK assets.
    if (!/^\d+\.\d+\.\d+$/.test(os) || !/^subnet-[a-f0-9]{17}$/.test(inputs.subnet)
      || !/^sg-[a-f0-9]{17}$/.test(inputs.security) || !/^[A-Za-z0-9+=,.@_-]+$/.test(inputs.profile)
      || !inputs.execution.startsWith(`arn:aws:iam::${this.config.account}:role/`)) throw new Error('Invalid host-slot parameters.');
    await this.apply(slot, { Phase: phase, OsVersion: os, SubnetId: inputs.subnet, SecurityGroupId: inputs.security,
      InstanceProfileName: inputs.profile, NetworkExecutionRoleArn: inputs.execution }, operation, resumeFailed);
  }
  async addresses(operation: string): Promise<void> { await this.apply('addresses', {}, operation); }
  private async apply(slot: HostSlot | 'addresses', parameters: Record<string, string>, operation: string, resumeFailed = false): Promise<void> {
    const existing = await this.observe(slot);
    if (existing?.status.endsWith('_IN_PROGRESS')) return;
    // Only explicit operator activation or cleanup may retry a preserved failure; background events cannot restart it.
    const explicitCleanup = parameters.Phase === 'network-only' || parameters.Phase === 'absent';
    if (existing && !['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'IMPORT_COMPLETE', ...(resumeFailed ? ['UPDATE_ROLLBACK_COMPLETE'] : []), ...(explicitCleanup || resumeFailed ? ['CREATE_FAILED', 'UPDATE_FAILED'] : [])].includes(existing.status)) {
      throw new Error(`Host-slot stack requires diagnosis: ${existing.status}`);
    }
    // CFN rejects reusing a completed operation token. Matching stable parameters/template prove the effect already finished.
    if (existing && ['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(existing.status) && existing.template === this.template
      && Object.entries(parameters).every(([key, value]) => existing.parameters[key] === value)) return;
    const TemplateURL = this.config.templates[slot];
    if (!/^https:\/\/(?:[a-z0-9.-]+\.s3\.[a-z0-9-]+\.amazonaws\.com|s3\.[a-z0-9-]+\.amazonaws\.com\/[a-z0-9.-]+)\/[a-f0-9]+\.json$/.test(TemplateURL)) {
      throw new Error('Host template must be an immutable regional CDK file asset.');
    }
    // A diagnosed terminal failure gets a new operator attempt; lost acknowledgements within that attempt remain idempotent.
    const retry = resumeFailed && existing && (existing.status.endsWith('_FAILED') || existing.status === 'UPDATE_ROLLBACK_COMPLETE') ? existing.updatedAt : undefined;
    const request = { StackName: existing?.id ?? this.name(slot), TemplateURL, RoleARN: this.config.role,
      Parameters: Object.entries(parameters).map(([ParameterKey, ParameterValue]) => ({ ParameterKey, ParameterValue })),
      Tags: Object.entries({ ...this.config.tags, GhostlineTemplate: this.template }).map(([Key, Value]) => ({ Key, Value })),
      ClientRequestToken: `ghostline-${createHash('sha256').update(JSON.stringify([operation, slot, TemplateURL, parameters, retry])).digest('hex')}` };
    try {
      if (existing) await this.cfn.send(new UpdateStackCommand({ ...request, DisableRollback: true }));
      else await this.cfn.send(new CreateStackCommand({ ...request, OnFailure: 'DO_NOTHING' }));
    } catch (error) {
      // A completed desired phase is idempotent. A rollback/permission/template failure must remain visible.
      if ((error as Error).name !== 'ValidationError') throw error;
      if (!/^No updates are to be performed\.?$/.test((error as Error).message)) {
        // This API receives only nonsecret host/template coordinates, so its validation reason is safe and necessary for resumption.
        throw new Error(`Host-slot ${slot} update rejected: ${(error as Error).message}`);
      }
    }
  }
  async removeAddresses(operation: string): Promise<void> {
    // Caller proves no associations remain. CloudFormation still prevents deleting an allocation reused elsewhere.
    const current = await this.observe('addresses');
    if (!current || current.status === 'DELETE_IN_PROGRESS') return;
    if (current.status.endsWith('_IN_PROGRESS')) throw new Error('Wait for the temporary-address stack operation before deletion.');
    await this.cfn.send(new DeleteStackCommand({ StackName: current.id, RoleARN: this.config.role,
      ClientRequestToken: `ghostline-${createHash('sha256').update(`${operation}/addresses/delete`).digest('hex')}` }));
  }
}
