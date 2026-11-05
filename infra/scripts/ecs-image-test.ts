import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { testEcsImages } from '../lib/ecs-image-tests.js';
import { releaseTag } from '../lib/ecs-release.js';
import { dnsReleaseArtifacts, type BuildArtifact } from '../lib/image-artifacts.js';
import { inspectQualifiedImage, type QualifiedImage } from '../lib/releases/image-publication.js';
import { qualifiedOs, loadNativeQualification } from '../lib/platform-qualification.js';

if (process.argv.length > 2) throw new Error('Usage: npm run test:ecs-images');
const images = await testEcsImages();
// Record the complete release set so publication can bind exact tested bytes to native qualification.
if (process.env.GHOSTLINE_QUALIFIED_OUTPUT) {
  const captured = {} as Record<BuildArtifact, QualifiedImage>;
  for (const name of dnsReleaseArtifacts) {
    const identity = await inspectQualifiedImage(images[name], args => { execFileSync('docker', args, { stdio: 'pipe' }); });
    captured[name] = { imageId: images[name], buildTag: releaseTag(name), runtimeDigest: identity.runtime.digest };
  }
  const os = qualifiedOs(captured, loadNativeQualification());
  writeFileSync(process.env.GHOSTLINE_QUALIFIED_OUTPUT, JSON.stringify({ qualifiedAt: new Date().toISOString(), images: captured, ...(os ? { os } : {}) }, null, 2) + '\n');
  if (!os) console.log('Local checks passed; native platform compatibility qualification is required before production publication.');
}
