import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type Protocol = 'xray' | 'awg';

export function releaseFiles(protocol: Protocol): Record<string, Buffer> {
  // The same bytes identify the release and populate its disposable build context; no local secrets.
  const files: Record<string, Buffer> = {
    Dockerfile: readFileSync(new URL(`../../runtime/ecs/${protocol}.Dockerfile`, import.meta.url)),
    [`${protocol}-start.sh`]: readFileSync(new URL(`../../runtime/ecs/${protocol}-start.sh`, import.meta.url)),
  };
  if (protocol === 'awg') files['start.sh'] = readFileSync(new URL('../../runtime/awg/start.sh', import.meta.url));
  return files;
}

export function releaseTag(protocol: Protocol): string {
  const hash = createHash('sha256');
  // NUL separators distinguish filenames/content boundaries; base digests and Xray checksum are inputs.
  for (const [name, bytes] of Object.entries(releaseFiles(protocol)).sort()) hash.update(name).update('\0').update(bytes).update('\0');
  return `sha-${hash.digest('hex')}`;
}
