import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { buildApp } from '../lib/app.js';
import { launch, testDeployment } from '../test/fixture.js';

// Synthesize fresh, using dummy identity and a public fixture; no credentials or AWS lookups.
try {
  const { app } = buildApp(launch, testDeployment);
  const assembly = app.synth();
  const artifact = assembly.getStackArtifact('GhostlinePoc');
  // Direct deployment must stay asset-free and small enough for CloudFormation TemplateBody.
  assert.equal(artifact.assumeRoleArn, undefined);
  assert.equal(artifact.cloudFormationExecutionRoleArn, undefined);
  assert.equal(artifact.requiresBootstrapStackVersion, undefined);
  assert.ok(readFileSync(artifact.templateFullPath).byteLength < 51_200);
  assert.ok(!Object.values(artifact.manifest.metadata ?? {}).flat().some((entry) => entry.type === 'aws:cdk:asset'));
  console.log(`Synthesized ${assembly.stacks.length} stack with offline inputs.`);
} finally {
  CloudAssembly.cleanupTemporaryDirectories();
}
