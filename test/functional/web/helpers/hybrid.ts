import assert from 'node:assert/strict';

import {retryInterval} from 'asyncbox';
import type {Browser} from 'webdriverio';

// Web Inspector may initially report only NATIVE_APP or pages from an earlier Safari session.
// Re-query the contexts, and switch only to a webview belonging to the application under test.
export async function switchToHybridWebview(
  driver: Browser,
  bundleId: string,
  tries = 3,
  interval = 1000,
): Promise<void> {
  await retryInterval(tries, interval, async () => {
    const contexts = (await driver.execute('mobile: getContexts', {waitForWebviewMs: 5000})) as unknown as {
      id: string;
      bundleId?: string;
    }[];
    const context = contexts.find((ctx) => ctx.id.startsWith('WEBVIEW_') && ctx.bundleId === bundleId);
    assert.ok(context, `Expected a webview for ${bundleId}, but got: ${JSON.stringify(contexts)}`);
    await driver.switchContext(context.id);
  });
}

// A successful navigation command can leave UIKitCatalog on its initial "WKWebView" page.
// Check the actual document before allowing a tap, and retry navigation if it never changes.
export async function openHybridPage(driver: Browser, url: string, tries = 3, interval = 1000): Promise<void> {
  await retryInterval(tries, interval, async () => {
    await driver.navigateTo(url);
    await driver.waitUntil(
      async () => {
        const documentState = (await driver.execute(
          'return {url: window.location.href, readyState: document.readyState}',
        )) as unknown as {url: string; readyState: string} | undefined;
        return documentState?.url === url && documentState.readyState === 'complete';
      },
      {timeout: 15000, interval: 500, timeoutMsg: `Hybrid webview did not finish loading ${url}`},
    );
  });
}
