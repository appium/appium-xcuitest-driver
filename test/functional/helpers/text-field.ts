import assert from 'node:assert/strict';

import {retryInterval} from 'asyncbox';
import type {Browser} from 'webdriverio';

export async function focusTextField(driver: Browser, selector: string, tries = 3, interval = 1000) {
  const focusedField = await retryInterval(tries, interval, async () => {
    // Keyboard transitions can invalidate the previous snapshot or swallow a tap.
    // Resolve the field again on each attempt, and retry only the focus operation.
    const field = await driver.$(selector);
    await field.waitForDisplayed({timeout: 10000});
    await field.click();
    await driver.waitUntil(() => driver.isKeyboardShown(), {
      timeout: 5000,
      interval: 500,
      timeoutMsg: `Keyboard did not appear after focusing ${selector}`,
    });
    return field;
  });
  assert.ok(focusedField, 'At least one focus attempt is required');
  return focusedField;
}
