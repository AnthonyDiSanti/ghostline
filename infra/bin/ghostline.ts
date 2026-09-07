#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { buildApp } from '../lib/app.js';
import { getDeployment } from '../lib/config.js';

const deployment = getDeployment(process.env.GHOSTLINE_DEPLOYMENT);

// Require launch inputs explicitly; offline checks use their own fixture, never the operator's key.
const cidr = process.env.GHOSTLINE_SSH_CIDR;
const publicKeyPath = process.env.GHOSTLINE_SSH_PUBLIC_KEY_PATH;
if (!cidr || !publicKeyPath) {
  throw new Error('Set GHOSTLINE_SSH_CIDR and GHOSTLINE_SSH_PUBLIC_KEY_PATH before running CDK.');
}
buildApp({ operatorSshCidr: cidr, sshPublicKey: readFileSync(publicKeyPath, 'utf8') }, deployment);
