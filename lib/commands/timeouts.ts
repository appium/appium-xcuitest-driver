import {BaseDriver} from 'appium/driver.js';

import type {XCUITestDriver} from '../driver.js';

/** Keeps an already-started automation session's timeout in sync with the driver's own. */
function syncAutomationSessionTimeout(
  driver: XCUITestDriver,
  field: 'pageLoadTimeoutMs' | 'scriptTimeoutMs' | 'implicitWaitTimeoutMs',
  ms: number,
): void {
  if (driver._remote?.automationSession?.isStarted) {
    driver._remote.automationSession[field] = ms;
  }
}

/**
 * Alias for {@linkcode XCUITestDriver.setScriptTimeout}, kept for the deprecated
 * `/timeouts/async_script` route.
 *
 * @param ms - The timeout in milliseconds
 * @deprecated Use {@linkcode XCUITestDriver.setScriptTimeout} instead
 */
export async function asyncScriptTimeout(this: XCUITestDriver, ms: number): Promise<void> {
  this.setScriptTimeout(this.parseTimeoutArgument(ms));
}

/**
 * Sets the page load timeout.
 *
 * Defers to `BaseDriver`'s own `setPageLoadTimeout` to keep `pageLoadTimeoutMs` (what
 * `GET /timeouts` reports) in sync, additionally tracking our own `pageLoadMs` and the active
 * automation session (if any), neither of which the base implementation knows about.
 *
 * @param ms - Timeout in milliseconds
 */
export function setPageLoadTimeout(this: XCUITestDriver, ms: number): void {
  ms = parseInt(String(ms), 10);
  BaseDriver.prototype.setPageLoadTimeout.call(this, ms);
  this.pageLoadMs = ms;
  if (this._remote) {
    this.remote.pageLoadMs = ms;
  }
  syncAutomationSessionTimeout(this, 'pageLoadTimeoutMs', ms);
}

/**
 * Sets the async script timeout.
 *
 * Defers to `BaseDriver`'s own `setScriptTimeout` to keep `scriptTimeoutMs` (what
 * `GET /timeouts` reports) in sync, additionally tracking our own `asyncWaitMs` and the active
 * automation session (if any), neither of which the base implementation knows about.
 *
 * @param ms - Timeout in milliseconds
 */
export function setScriptTimeout(this: XCUITestDriver, ms: number): void {
  BaseDriver.prototype.setScriptTimeout.call(this, ms);
  this.asyncWaitMs = ms;
  syncAutomationSessionTimeout(this, 'scriptTimeoutMs', ms);
}

/**
 * Sets the implicit wait timeout.
 *
 * Defers to `BaseDriver`'s own `setImplicitWait`, additionally keeping the active automation
 * session (if any) in sync - its implicit wait defaults to `0` independently of the rest of the
 * driver, so it would otherwise silently diverge from what the client configured.
 *
 * @param ms - Timeout in milliseconds
 */
export function setImplicitWait(this: XCUITestDriver, ms: number): void {
  BaseDriver.prototype.setImplicitWait.call(this, ms);
  syncAutomationSessionTimeout(this, 'implicitWaitTimeoutMs', ms);
}
