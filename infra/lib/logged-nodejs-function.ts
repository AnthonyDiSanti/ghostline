import { RemovalPolicy } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, type NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, type RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

type OwnedSetting = 'runtime' | 'bundling' | 'logGroup' | 'logRetention' | 'logRetentionRole' | 'logRetentionRetryOptions';
type ExplicitSetting = 'entry' | 'depsLockFilePath' | 'architecture' | 'memorySize' | 'timeout' | 'reservedConcurrentExecutions' | 'retryAttempts';

export interface LoggedNodejsFunctionProps {
  log: { id: string; retention: RetentionDays; removalPolicy: RemovalPolicy };
  function: Omit<NodejsFunctionProps, OwnedSetting> & Required<Pick<NodejsFunctionProps, ExplicitSetting>>;
}

export function loggedNodejsFunction(scope: Construct, id: string, props: LoggedNodejsFunctionProps): NodejsFunction {
  // Keep resources at the caller's scope so extracting the recipe preserves deployed logical IDs.
  const owned: OwnedSetting[] = ['runtime', 'bundling', 'logGroup', 'logRetention', 'logRetentionRole', 'logRetentionRetryOptions'];
  if (owned.some(key => Object.hasOwn(props.function, key))) throw new Error('Lambda factory owns runtime, bundling and log-group construction.');
  const logGroup = new LogGroup(scope, props.log.id, {
    retention: props.log.retention, removalPolicy: props.log.removalPolicy,
  });
  return new NodejsFunction(scope, id, {
    ...props.function, runtime: Runtime.NODEJS_24_X, logGroup,
    // Bundle the selected SDK rather than inheriting whichever version the Lambda runtime provides.
    bundling: { minify: true, externalModules: [] },
  });
}
