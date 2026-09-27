import { CfnOutput, CliCredentialsStackSynthesizer, Duration, LegacyStackSynthesizer, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { createHash } from 'node:crypto';

// Long campaign identifiers and regional names must still fit S3's 63-character global name limit.
export const benchmarkBucket = (account: string, region: string, id: string, kind: string) => `ghostline-bm-${createHash('sha256').update(id).digest('hex').slice(0,16)}-${kind}-${account}-${region}`;
export class BenchmarkStorageStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { campaign: string; fixture: boolean }) {
    super(scope, id, { ...props, synthesizer: new LegacyStackSynthesizer() });
    // Explicit empty-before-delete in the runner avoids a cleanup Lambda and its additional authority.
    const bucket = new s3.Bucket(this, 'Bucket', { bucketName: benchmarkBucket(this.account, this.region, props.campaign, props.fixture ? 'data' : 'code'),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true, objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED, removalPolicy: RemovalPolicy.DESTROY,
      lifecycleRules: [{ expiration: Duration.days(1), abortIncompleteMultipartUploadAfter: Duration.days(1) }],
      cors: props.fixture ? [{ allowedMethods: [s3.HttpMethods.GET], allowedOrigins: ['*'], allowedHeaders: ['*'], exposedHeaders: ['Content-Length'] }] : undefined });
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
export class BenchmarkProbeStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { campaign: string; assetPath: string }) {
    super(scope, id, { ...props, synthesizer: new CliCredentialsStackSynthesizer({ fileAssetsBucketName: benchmarkBucket(props.env!.account!, props.env!.region!, props.campaign, 'code') }) });
    // Non-VPC Lambda is the entire regional prescreen: no EIP, customer network, registry or VPN resources.
    const probe = new lambda.Function(this, 'Probe', { runtime: lambda.Runtime.NODEJS_24_X, architecture: lambda.Architecture.X86_64,
      code: lambda.Code.fromAsset(props.assetPath), handler: 'index.handler', memorySize: 2048,
      timeout: Duration.seconds(60), reservedConcurrentExecutions: 1,
      logGroup: new logs.LogGroup(this, 'Logs', { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.RETAIN }) });
    new CfnOutput(this, 'FunctionName', { value: probe.functionName });
  }
}
