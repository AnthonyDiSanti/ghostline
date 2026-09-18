import { readFileSync } from 'node:fs';
import { renderFixture } from './fixtures.js';

export function ecsVerificationCommand(): string {
  // Ship both nonsecret Python files together; verification must also work on hosts predating extraction.
  const file = (name: string) => new URL(`../../runtime/ecs/${name}`, import.meta.url);
  return renderFixture(file('verify.sh'), {
    VERIFIER: readFileSync(file('verify.py')).toString('base64'),
    NETWORK_PROBE: readFileSync(file('network-probe.py')).toString('base64'),
  });
}
