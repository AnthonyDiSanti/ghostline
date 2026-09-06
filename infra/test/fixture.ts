import { readFileSync } from 'node:fs';
import { deployment } from '../lib/config.js';

// This generated test-only public key has no relationship to the deployed SSH identity.
export const launch = {
  operatorSshCidr: '203.0.113.10/32',
  sshPublicKey: readFileSync(new URL('./ssh-key.pub', import.meta.url), 'utf8'),
};
export const testDeployment = { ...deployment, account: '000000000000' };
