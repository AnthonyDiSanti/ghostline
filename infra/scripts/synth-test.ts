import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { buildApp } from '../lib/app.js';
import { deploymentIds, getDeployment } from '../lib/config.js';

// Synthesize fresh, using a dummy account; no credentials or AWS lookups.
try {
  for (const id of deploymentIds) {
    const config = { ...getDeployment(id), account: '000000000000' };
    const { app } = buildApp(config);
    const assembly = app.synth();
    const artifact = assembly.getStackArtifact(config.stackName);
    // Direct deployment must stay asset-free and small enough for CloudFormation TemplateBody.
    assert.equal(artifact.assumeRoleArn, undefined);
    assert.equal(artifact.cloudFormationExecutionRoleArn, undefined);
    assert.equal(artifact.requiresBootstrapStackVersion, undefined);
    assert.ok(readFileSync(artifact.templateFullPath).byteLength < 51_200);
    assert.ok(!Object.values(artifact.manifest.metadata ?? {}).flat().some((entry) => entry.type === 'aws:cdk:asset'));
    assert.equal(assembly.stacks.length, 2);
    assert.equal(artifact.environment.region, config.region);
    console.log(`Synthesized ${id} with offline inputs.`);
  }
} finally {
  CloudAssembly.cleanupTemporaryDirectories();
}
