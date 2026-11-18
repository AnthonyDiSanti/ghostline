import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { testDerpImage } from '../lib/derp-image-tests.js';
import { releaseTag } from '../lib/ecs-release.js';
import { inspectQualifiedImage } from '../lib/releases/image-publication.js';

if (process.argv.length > 2) throw new Error('Usage: npm run test:derp-image');
// This record qualifies only the local protocol image, never a whole-stack/native platform release.
const imageId = await testDerpImage();
const identity = await inspectQualifiedImage(imageId, args => { execFileSync('docker', args, { stdio: 'pipe' }); });
if (process.env.GHOSTLINE_QUALIFIED_OUTPUT) {
  writeFileSync(process.env.GHOSTLINE_QUALIFIED_OUTPUT, JSON.stringify({ verifiedAt: new Date().toISOString(),
    scope: 'derp-image-only', images: { derp: { imageId, buildTag: releaseTag('derp'), runtimeDigest: identity.runtime.digest } } }, null, 2) + '\n', { mode: 0o600 });
}
