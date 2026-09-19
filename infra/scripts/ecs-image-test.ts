import { testEcsImages } from '../lib/ecs-image-tests.js';

if (process.argv.length > 2) throw new Error('Usage: npm run test:ecs-images');
await testEcsImages();
