import type { Browser } from 'playwright-core';
import { classifyAccess, type AccessResult, type Canary } from './model.js';

export async function checkAccess(browser: Browser, canary: Canary): Promise<AccessResult> {
  // No browser traces, request URLs, screenshots or page contents leave this routine.
  const context = await browser.newContext({ ignoreHTTPSErrors: false, serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    // Keep one context for Lambda's single-process Chromium. Standard HTTP identification preserves the actual OS/version.
    await context.setExtraHTTPHeaders({ 'User-Agent': userAgent.replace('HeadlessChrome/', 'Chrome/') });
    const response = await page.goto(canary.url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForTimeout(1500);
    if (response?.headers()['cf-mitigated'] === 'challenge') {
      return { status: 'inconclusive', reason: 'browser-challenge', httpStatus: response.status() };
    }
    const text = await page.locator('body').innerText({ timeout: 3000 });
    // A rendered verification modal can obscure otherwise valid page landmarks; do not mistake them for access.
    const dialogs = await page.locator('dialog:visible, [role="dialog"]:visible, [aria-modal="true"]:visible').allTextContents();
    if (dialogs.some(dialog => classifyAccess(200, dialog, false).status === 'restricted')) {
      return { status: 'restricted', reason: 'verification-gate', httpStatus: response?.status() };
    }
    const expected = text.toLowerCase().includes(canary.expectedText.toLowerCase())
      && (!canary.requiredSelector || await page.locator(canary.requiredSelector).first().isVisible());
    return classifyAccess(response?.status() ?? 0, text.slice(0, 100_000), expected);
  } catch (error) {
    // A crashed browser is broken instrumentation, not a regional network failure. Never return raw browser error text/URLs.
    if (!browser.isConnected() || /has been closed|TargetClosed/i.test((error as Error).message)) return { status: 'inconclusive', reason: 'probe-browser-failure' };
    return { status: 'transport-failure', reason: (error as Error).name === 'TimeoutError' ? 'navigation-timeout' : 'navigation-incomplete' };
  }
  finally { await context.close(); }
}
