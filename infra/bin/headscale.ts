import { readFileSync } from 'node:fs';
import { buildHeadscaleApp, type HeadscaleRuntimeInputs } from '../lib/headscale-stack.js';
import { loadHeadscaleConfig } from '../lib/headscale-config.js';

// The CLI writes public operation inputs; synthesis never discovers releases or mutates cloud state.
const path = process.env.GHOSTLINE_HEADSCALE_INPUTS;
const inputs = path ? JSON.parse(readFileSync(path, 'utf8')) as HeadscaleRuntimeInputs : undefined;
buildHeadscaleApp(loadHeadscaleConfig(), inputs);
