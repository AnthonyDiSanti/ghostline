import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { buildApp } from '../lib/app.js';
import { launch } from '../test/fixture.js';
import { deploymentIds, getDeployment } from '../lib/config.js';

// Synthesize fresh, using dummy identity and a public fixture; no credentials or AWS lookups.
try {
  for (const id of deploymentIds) {
    const config = { ...getDeployment(id), account: '000000000000' };
    const { app } = buildApp(launch, config);
    const assembly = app.synth();
    const artifact = assembly.getStackArtifact(config.stackName);
    // Direct deployment must stay asset-free and small enough for CloudFormation TemplateBody.
    assert.equal(artifact.assumeRoleArn, undefined);
    assert.equal(artifact.cloudFormationExecutionRoleArn, undefined);
    assert.equal(artifact.requiresBootstrapStackVersion, undefined);
    assert.ok(readFileSync(artifact.templateFullPath).byteLength < 51_200);
    assert.ok(!Object.values(artifact.manifest.metadata ?? {}).flat().some((entry) => entry.type === 'aws:cdk:asset'));
    assert.equal(assembly.stacks.length, config.ecs ? 2 : 1);
    assert.equal(artifact.environment.region, config.region);
    console.log(`Synthesized ${id} with offline inputs.`);
  }
} finally {
  CloudAssembly.cleanupTemporaryDirectories();
}
