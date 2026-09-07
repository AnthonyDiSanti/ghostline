import { readFileSync } from 'node:fs';

// This generated test-only public key has no relationship to the deployed SSH identity.
export const launch = {
  operatorSshCidr: '203.0.113.10/32',
  sshPublicKey: readFileSync(new URL('./ssh-key.pub', import.meta.url), 'utf8'),
};
