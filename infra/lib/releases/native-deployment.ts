import { DescribeServiceDeploymentsCommand, ListServiceDeploymentsCommand, type ECSClient, type ServiceDeployment } from '@aws-sdk/client-ecs';
import type { DeploymentIdentity } from './deployment-hook.js';

export type NativeDeployment = DeploymentIdentity & { status: string; stage?: string };
export function deploymentIdentity(value: ServiceDeployment, service: string, blue: string): NativeDeployment {
  // A same-definition deployment still has a new service revision. Never infer traffic direction from task-definition revision.
  if (value.serviceArn !== service || !value.serviceDeploymentArn || !value.targetServiceRevision?.arn || !value.status
    || value.sourceServiceRevisions?.length !== 1 || value.sourceServiceRevisions[0]?.arn !== blue
    || value.targetServiceRevision.arn === blue) throw new Error('Unexpected native deployment identity.');
  return { service, deployment: value.serviceDeploymentArn, blueRevision: blue, greenRevision: value.targetServiceRevision.arn,
    status: value.status, stage: value.lifecycleStage };
}

export async function readNativeDeployment(ecs: Pick<ECSClient, 'send'>, cluster: string, service: string, blue: string,
  requestedAt: number, known?: DeploymentIdentity): Promise<NativeDeployment | undefined> {
  let arns: string[] = [];
  if (known) arns = [known.deployment];
  else {
    // Lost UpdateService acknowledgements are resolved from native history, not by replaying forceNewDeployment.
    let nextToken: string | undefined;
    do {
      const page = await ecs.send(new ListServiceDeploymentsCommand({ cluster, service, nextToken,
        createdAt: { after: new Date(requestedAt - 5_000) } }));
      arns.push(...(page.serviceDeployments ?? []).flatMap(d => d.serviceDeploymentArn ? [d.serviceDeploymentArn] : []));
      nextToken = page.nextToken;
    } while (nextToken);
  }
  if (!arns.length) return undefined;
  const values: ServiceDeployment[] = [];
  for (let i = 0; i < arns.length; i += 20) {
    const result = await ecs.send(new DescribeServiceDeploymentsCommand({ serviceDeploymentArns: arns.slice(i, i + 20) }));
    if (result.failures?.length || result.serviceDeployments?.length !== Math.min(20, arns.length - i)) throw new Error('Native deployment observation is incomplete.');
    values.push(...result.serviceDeployments);
  }
  const candidates = known ? values : values.filter(v => v.sourceServiceRevisions?.some(r => r.arn === blue));
  if (!candidates.length) return undefined;
  if (candidates.length !== 1) throw new Error('Multiple native deployments compete with the recorded rollout.');
  const found = deploymentIdentity(candidates[0]!, service, blue);
  if (known && (found.deployment !== known.deployment || found.greenRevision !== known.greenRevision)) throw new Error('Native rollout identity changed.');
  return found;
}
