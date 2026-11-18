import { CloudFormationClient, CreateChangeSetCommand, DeleteChangeSetCommand, DescribeChangeSetCommand,
  DescribeStacksCommand, ExecuteChangeSetCommand, GetTemplateCommand, type Change } from '@aws-sdk/client-cloudformation';
import { parse as parseYaml } from 'yaml';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertTrialTemplateUrl } from './candidates.js';
import { assetBucketName } from './names.js';
import { digest } from './model.js';
import type { DeploymentConfig } from '../config.js';

export interface StackCapture { url: string; parameters: Record<string, string> }
type Cfn = Pick<CloudFormationClient, 'send'>;
export function templateObject(body: unknown): any {
  // CloudFormation may return either JSON objects or YAML strings for its processed template.
  const template = typeof body === 'string' ? parseYaml(body) : body;
  if (!template || typeof template !== 'object' || !template.Resources) throw new Error('Incomplete captured stack template.');
  return template;
}

export function assertCaptureSafe(template: any, parameters: Record<string, string>): void {
  // Only infrastructure references may enter the trial journal/S3; masked parameters cannot be reconstructed safely.
  for (const [name, definition] of Object.entries(template.Parameters ?? {}) as Array<[string, any]>) {
    if (definition.NoEcho === true || definition.NoEcho === 'true' || parameters[name] === '****') throw new Error('Secret stack parameters cannot be captured.');
  }
  if (Object.values(parameters).some(value => value === undefined)) throw new Error('Missing captured stack parameter.');
}

export function assertGatewayReturnChanges(changes: Change[]): void {
  // A trial may change its task/IAM interface, never replace networking or the user's endpoints on return.
  const allowed = new Set(['AWS::ECS::TaskDefinition', 'AWS::ECS::Service', 'AWS::IAM::Role', 'AWS::IAM::Policy', 'AWS::CDK::Metadata']);
  for (const change of changes) {
    const resource = change.ResourceChange;
    if (!resource || !allowed.has(resource.ResourceType ?? '') || resource.ResourceType === 'AWS::ECS::Service'
      && (resource.Action !== 'Modify' || resource.Replacement !== 'False')) throw new Error('Return diff changes resources outside the gateway task/IAM boundary.');
  }
}

export class TrialStacks {
  constructor(readonly config: DeploymentConfig, readonly cfn: Cfn,
    readonly aws: (args: string[]) => unknown, readonly report = console.log,
    readonly wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))) {}

  template(capture: StackCapture): any {
    // Compare installed state to checksum-verified captured bytes before deciding whether ECS needs a new deployment.
    assertTrialTemplateUrl(capture.url, this.config);
    const key = new URL(capture.url).pathname.split('/').at(-1)!;
    const folder = mkdtempSync(join(tmpdir(), 'ghostline-trial-template-'));
    try {
      const file = join(folder, key);
      this.aws(['s3api', 'get-object', '--bucket', assetBucketName(this.config.account, this.config.region), '--key', key, file]);
      const data = readFileSync(file, 'utf8');
      if (`${digest(data).slice(7)}.json` !== key) throw new Error('Captured baseline template checksum mismatch.');
      return templateObject(data);
    } finally { rmSync(folder, { recursive: true, force: true }); }
  }

  async capture(name: string): Promise<StackCapture> {
    // Snapshot the installed recipe, not a locally synthesized approximation of the previous branch.
    const response = await this.cfn.send(new DescribeStacksCommand({ StackName: name }));
    const stack = response.Stacks?.[0];
    if (response.Stacks?.length !== 1 || stack?.StackName !== name || !['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(stack.StackStatus ?? '')
      || !stack.StackId?.startsWith(`arn:aws:cloudformation:${this.config.region}:${this.config.account}:stack/${name}/`)) throw new Error('Capture requires a completed owned stack.');
    const body = await this.cfn.send(new GetTemplateCommand({ StackName: stack.StackId, TemplateStage: 'Processed' }));
    const template = templateObject(body.TemplateBody);
    const parameters = Object.fromEntries((stack.Parameters ?? []).map(p => [p.ParameterKey!, p.ParameterValue!]));
    assertCaptureSafe(template, parameters);
    const data = JSON.stringify(template), key = `${digest(data).slice(7)}.json`;
    const folder = mkdtempSync(join(tmpdir(), 'ghostline-trial-capture-'));
    try {
      const file = join(folder, key); writeFileSync(file, data, { mode: 0o600 });
      this.aws(['s3api', 'put-object', '--bucket', assetBucketName(this.config.account, this.config.region), '--key', key,
        '--body', file, '--content-type', 'application/json', '--server-side-encryption', 'AES256']);
    } finally { rmSync(folder, { recursive: true, force: true }); }
    return { url: `https://${assetBucketName(this.config.account, this.config.region)}.s3.${this.config.region}.amazonaws.com/${key}`, parameters };
  }

  async restore(name: string, capture: StackCapture, gateway = false): Promise<void> {
    // A fresh reviewed change set supplies both the return diff and the exact immutable baseline recipe.
    assertTrialTemplateUrl(capture.url, this.config);
    const ChangeSetName = `ghostline-trial-${randomUUID()}`;
    await this.cfn.send(new CreateChangeSetCommand({ StackName: name, ChangeSetName, ChangeSetType: 'UPDATE',
      TemplateURL: capture.url, Capabilities: ['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
      Parameters: Object.entries(capture.parameters).map(([ParameterKey, ParameterValue]) => ({ ParameterKey, ParameterValue })) }));
    let ready = false;
    try {
      for (let attempt = 0; attempt < 90; attempt++) {
        const changeSet = await this.cfn.send(new DescribeChangeSetCommand({ StackName: name, ChangeSetName }));
        if (changeSet.Status === 'FAILED') {
          if (/didn't contain changes|No updates are to be performed/.test(changeSet.StatusReason ?? '')) return;
          throw new Error('Captured baseline change set failed; inspect CloudFormation metadata.');
        }
        if (changeSet.Status === 'CREATE_COMPLETE') {
          if (changeSet.NextToken) throw new Error('Trial return diff exceeds the bounded review.');
          if (gateway) assertGatewayReturnChanges(changeSet.Changes ?? []);
          this.report(JSON.stringify({ stack: name, baselineDiff: (changeSet.Changes ?? []).map(c => ({ action: c.ResourceChange?.Action,
            logicalId: c.ResourceChange?.LogicalResourceId, type: c.ResourceChange?.ResourceType, replacement: c.ResourceChange?.Replacement })) }));
          ready = true; break;
        }
        await this.wait(2000);
      }
      if (!ready) throw new Error('Baseline change-set preparation is pending.');
      await this.cfn.send(new ExecuteChangeSetCommand({ StackName: name, ChangeSetName }));
      for (let attempt = 0; attempt < 360; attempt++) {
        const stack = (await this.cfn.send(new DescribeStacksCommand({ StackName: name }))).Stacks?.[0];
        if (stack?.StackStatus === 'UPDATE_COMPLETE') return;
        if (!stack?.StackStatus?.endsWith('_IN_PROGRESS')) throw new Error(`Baseline stack restoration needs inspection (${stack?.StackStatus}).`);
        await this.wait(5000);
      }
      throw new Error('Baseline stack restoration remains pending; resume the same trial operation.');
    } finally {
      // Never delete a running change set. Completed/unused reviews are disposable; the immutable capture remains.
      if (!ready) await this.cfn.send(new DeleteChangeSetCommand({ StackName: name, ChangeSetName }));
    }
  }
}
