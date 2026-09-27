import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { getDeployment } from '../lib/config.js';
import { buildBenchmarkAssets } from '../lib/benchmark/assets.js';
import { BenchmarkCloud } from '../lib/benchmark/cloud.js';
import { createJournal, readJson, saveJson, validateCampaign, type Journal } from '../lib/benchmark/model.js';
import { assertDisposableRegion } from '../lib/benchmark/runner.js';

// Explicitly invoked live qualification: only minimal probes, never gateway/S3 streaming infrastructure.
const [input] = process.argv.slice(2);
if (!input) throw new Error('Supply a private campaign JSON file.');
const config = validateCampaign(readJson(resolve(input)));
const maintained = JSON.parse(readFileSync('deployment.json', 'utf8'));
for (const region of config.regions) assertDisposableRegion(region, maintained);
const folder = resolve('../.local/benchmarks', config.id), path = resolve(folder, 'journal.json');
const journal = existsSync(path) ? readJson<Journal>(path) : createJournal(config);
const catalog = resolve(folder, 'deployment.json'); saveJson(catalog, maintained);
const save = () => saveJson(path, journal); save();
const assets = await buildBenchmarkAssets(process.cwd(), folder);
const cloud = new BenchmarkCloud(process.cwd(), folder, getDeployment(config.source).account, journal, assets.probe, catalog, save);
for (const record of journal.records) {
  try { record.phase = 'probe'; save(); record.access = await cloud.probe(record); save(); console.log(JSON.stringify({ region: record.region, result: record.access })); }
  finally { await cloud.cleanupProbe(record); record.phase = 'done'; save(); }
}
journal.complete = true; save();
console.log('Minimal probe cleanup completed; no gateway was deployed.');
