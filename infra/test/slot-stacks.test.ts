import { expect, it, vi } from 'vitest';
import { SlotStacks } from '../lib/releases/slot-stacks.js';

function fixture(status?: string, updatedAt = new Date(1000)) {
  const sent: any[] = [];
  const config = { endpoint: 'GhostlineTest', account: '111111111111', region: 'eu-west-1', role: 'arn:aws:iam::111111111111:role/slot-provisioner',
    templates: { a: 'https://assets.s3.eu-west-1.amazonaws.com/abc.json', b: 'https://assets.s3.eu-west-1.amazonaws.com/def.json', addresses: 'https://assets.s3.eu-west-1.amazonaws.com/123.json' },
    tags: { Project: 'Ghostline', Environment: 'prod', System: 'shared' } };
  const inputs = { subnet: `subnet-${'a'.repeat(17)}`, security: `sg-${'b'.repeat(17)}`, profile: 'host-profile', execution: 'arn:aws:iam::111111111111:role/network-execution' };
  const send = vi.fn(async (command: any) => {
    sent.push(command);
    if (command.constructor.name === 'ListStackResourcesCommand') return { StackResourceSummaries: [] };
    if (command.constructor.name === 'DescribeStacksCommand') {
      if (!status) throw Object.assign(new Error('Stack with id GhostlineTest-Host-b does not exist'), { name: 'ValidationError' });
      return { Stacks: [{ StackName: 'GhostlineTest-Host-b', StackId: 'arn:aws:cloudformation:eu-west-1:111111111111:stack/GhostlineTest-Host-b/uuid',
        StackStatus: status, LastUpdatedTime: updatedAt, Tags: Object.entries(config.tags).map(([Key, Value]) => ({ Key, Value })) }] };
    }
    return {};
  });
  return { stacks: new SlotStacks(config, { send } as any), send, sent, config, inputs };
}
it('creates only an immutable template with deterministic retry token and no inline template or IAM capability', async () => {
  const f = fixture(); await f.stacks.ensure('b', 'network-only', '1.66.0', f.inputs, 'rollout/network');
  const first = f.sent.at(-1).input;
  expect(first).toMatchObject({ TemplateURL: f.config.templates.b, RoleARN: f.config.role, OnFailure: 'DO_NOTHING' });
  expect(first.TemplateBody).toBeUndefined(); expect(first.Capabilities).toBeUndefined();
  await f.stacks.ensure('b', 'network-only', '1.66.0', f.inputs, 'rollout/network');
  expect(f.sent.at(-1).input.ClientRequestToken).toBe(first.ClientRequestToken);
});
it('observes in-progress operations instead of trying competing updates', async () => {
  const f = fixture('UPDATE_IN_PROGRESS'); await f.stacks.ensure('b', 'running', '1.66.0', f.inputs, 'rollout/host');
  expect(f.sent.map(x => x.constructor.name)).toEqual(['DescribeStacksCommand', 'ListStackResourcesCommand']);
});
it('never treats denied reads or rolled-back stacks as absence', async () => {
  const f = fixture('ROLLBACK_COMPLETE');
  await expect(f.stacks.ensure('b', 'running', '1.66.0', f.inputs, 'one')).rejects.toThrow('diagnosis');
  f.send.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'AccessDenied' }));
  await expect(f.stacks.observe('b')).rejects.toThrow('denied');
});
it('rejects same-name stacks with a different ownership tag before mutation', async () => {
  const f = fixture(); f.send.mockResolvedValueOnce({ Stacks: [{ StackName: 'GhostlineTest-Host-b',
    StackId: 'arn:aws:cloudformation:eu-west-1:111111111111:stack/GhostlineTest-Host-b/uuid', StackStatus: 'CREATE_COMPLETE', LastUpdatedTime: new Date(1000), Tags: [{ Key: 'Project', Value: 'Other' }] }] });
  await expect(f.stacks.ensure('b', 'running', '1.66.0', f.inputs, 'one')).rejects.toThrow('ownership');
  expect(f.sent).toEqual([]);
});
it('resumes a preserved failed launch only through explicit operator activation', async () => {
  const f = fixture('UPDATE_FAILED');
  await expect(f.stacks.ensure('b', 'running', '1.66.0', f.inputs, 'resume')).rejects.toThrow('diagnosis');
  await f.stacks.ensure('b', 'running', '1.66.0', f.inputs, 'resume', true);
  expect(f.sent.at(-1).constructor.name).toBe('UpdateStackCommand');
  expect(f.sent.at(-1).input.DisableRollback).toBe(true);
});

it('gives an explicitly retried terminal failure a fresh token while preserving uncertain-request idempotency', async () => {
  const first = fixture('UPDATE_FAILED', new Date(1000)), next = fixture('UPDATE_FAILED', new Date(2000));
  await first.stacks.ensure('b', 'running', '1.66.0', first.inputs, 'resume', true);
  const token = first.sent.at(-1).input.ClientRequestToken;
  await first.stacks.ensure('b', 'running', '1.66.0', first.inputs, 'resume', true);
  expect(first.sent.at(-1).input.ClientRequestToken).toBe(token);
  await next.stacks.ensure('b', 'running', '1.66.0', next.inputs, 'resume', true);
  expect(next.sent.at(-1).input.ClientRequestToken).not.toBe(token);
});

it('does not resubmit a completed request token when stable stack parameters and template already match', async () => {
  const f = fixture('UPDATE_COMPLETE');
  const parameters = { Phase: 'running', OsVersion: '1.66.0', SubnetId: f.inputs.subnet, SecurityGroupId: f.inputs.security,
    InstanceProfileName: f.inputs.profile, NetworkExecutionRoleArn: f.inputs.execution };
  f.stacks.observe = async () => ({ id: 'owned', status: 'UPDATE_COMPLETE', template: f.stacks.template, parameters, resources: {}, outputs: {} });
  await f.stacks.ensure('b', 'running', '1.66.0', f.inputs, 'already-completed');
  expect(f.sent).toEqual([]);
});
