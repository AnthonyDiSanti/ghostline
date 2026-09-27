import chromium from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright-core';
import { checkAccess } from '../lib/benchmark/browser.js';
import { validateCampaign, type Canary } from '../lib/benchmark/model.js';

export async function handler(event: { canary: Canary }) {
  // Invocation data never enters logs, and the browser inherits no AWS execution-role credentials.
  let browser;
  let stage = 'input';
  try {
    validateCampaign({ id: 'probe', source: 'stockholm-ecs', regions: ['eu-west-2'], canary: event.canary });
    stage = 'chromium-extraction';
    const executablePath = await chromium.executablePath('/var/task/bin');
    stage = 'browser-launch';
    // Serverless process/sandbox constraints are handled by Lambda isolation; retain normal web-origin and mixed-content checks.
    const args = chromium.args.filter(flag => !['--disable-web-security', '--allow-running-insecure-content'].includes(flag));
    browser = await playwright.launch({ executablePath, args,
      headless: true, env: { PATH: process.env.PATH!, HOME: '/tmp', TMPDIR: '/tmp', LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH ?? '' } });
    return await checkAccess(browser, event.canary);
  } catch { return { status: 'inconclusive', reason: `probe-${stage}-failure` }; }
  finally { await browser?.close(); }
}
