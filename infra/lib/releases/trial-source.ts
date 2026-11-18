import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { digest } from './model.js';

export function trialSourceDigest(): string {
  // Keep checkout-only source discovery out of the shared Lambda candidate parser.
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const files: string[] = [];
  const collect = (path: string) => {
    if (lstatSync(path).isSymbolicLink()) throw new Error('Trial sources may not contain symlinks.');
    if (lstatSync(path).isDirectory()) for (const name of readdirSync(path).sort()) collect(join(path, name));
    else files.push(path);
  };
  // Documentation and native evidence may change; executable inputs and image source identities stay frozen.
  for (const path of ['infra/lib', 'infra/lambda', 'infra/bin', 'infra/scripts', 'infra/packages/notifications/src',
    'infra/package.json', 'infra/package-lock.json', 'infra/cdk.json', 'infra/deployment.json', 'infra/image-inputs.json']) collect(join(root, path));
  return digest(Buffer.concat(files.sort().flatMap(path => [Buffer.from(relative(root, path) + '\0'), readFileSync(path), Buffer.from('\0')])));
}
