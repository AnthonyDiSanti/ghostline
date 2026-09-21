import { writeFileSync } from 'node:fs';
import { testEcsImages } from '../lib/ecs-image-tests.js';
import { imageArtifacts, releaseTag } from '../lib/ecs-release.js';

if (process.argv.length > 2) throw new Error('Usage: npm run test:ecs-images');
const images = await testEcsImages();
// Only the central stable-build workflow requests a qualification record for later publication.
if (process.env.GHOSTLINE_QUALIFIED_OUTPUT) writeFileSync(process.env.GHOSTLINE_QUALIFIED_OUTPUT,
  JSON.stringify({ qualifiedAt: new Date().toISOString(), images: Object.fromEntries(imageArtifacts.map(name =>
    [name, { imageId: images[name], buildTag: releaseTag(name) }])) }, null, 2) + '\n');
