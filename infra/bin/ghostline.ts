#!/usr/bin/env node
import { buildApp } from '../lib/app.js';
import { getDeployment } from '../lib/config.js';
import { guardDutyForDeployment } from '../lib/guardduty-discovery.js';

// Every region uses the same SSH-free gateway; only explicit catalog identity and lifecycle vary.
const deployment = getDeployment(process.env.GHOSTLINE_DEPLOYMENT);
const lifecycle = process.env.GHOSTLINE_LIFECYCLE ?? 'active';
if (!['active', 'parked'].includes(lifecycle)) throw new Error('Invalid lifecycle state.');
// Live CLI invocations never reuse CDK context or a catalog's cached regional capability flags.
const support = lifecycle === 'parked' ? { service: false, runtime: false } : guardDutyForDeployment(deployment);
buildApp(deployment, support, {}, lifecycle as 'active' | 'parked');
