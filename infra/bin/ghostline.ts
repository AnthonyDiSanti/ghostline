#!/usr/bin/env node
import { buildApp } from '../lib/app.js';
import { getDeployment } from '../lib/config.js';

// Every region uses the same SSH-free gateway; only explicit catalog identity and lifecycle vary.
const deployment = getDeployment(process.env.GHOSTLINE_DEPLOYMENT);
const lifecycle = process.env.GHOSTLINE_LIFECYCLE ?? 'active';
if (!['active', 'parked'].includes(lifecycle)) throw new Error('Invalid lifecycle state.');
buildApp(deployment, {}, lifecycle as 'active' | 'parked');
