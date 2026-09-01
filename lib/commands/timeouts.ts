import {BaseDriver} from 'appium/driver.js';

import type {XCUITestDriver} from '../driver.js';

/**
 * Sets the page load timeout using W3C protocol.
 *
 * @param ms - Timeout in milliseconds
 */
export async function pageLoadTimeoutW3C(this: XCUITestDriver, ms: number): Promise<void> {
  await this.setPageLoadTimeout(this.parseTimeoutArgument(ms));
}

/**
 * Sets the page load timeout using MJSONWP protocol.
 *
 * @param ms - Timeout in milliseconds
 */
export async function pageLoadTimeoutMJSONWP(this: XCUITestDriver, ms: number): Promise<void> {
  await this.setPageLoadTimeout(this.parseTimeoutArgument(ms));
}

/**
 * Sets the async script timeout using W3C protocol.
 *
 * @param ms - Timeout in milliseconds
 */
export async function scriptTimeoutW3C(this: XCUITestDriver, ms: number): Promise<void> {
  // XXX: this is synchronous
  await this.setAsyncScriptTimeout(this.parseTimeoutArgument(ms));
}

/**
 * Alias for {@linkcode XCUITestDriver.scriptTimeoutW3C}.
 *
 * @param ms - The timeout in milliseconds
 * @deprecated Use {@linkcode XCUITestDriver.scriptTimeoutW3C} instead
 */
export async function scriptTimeoutMJSONWP(this: XCUITestDriver, ms: number): Promise<void> {
  await this.asyncScriptTimeout(ms);
}

/**
 * Alias for {@linkcode XCUITestDriver.scriptTimeoutW3C}.
 *
 * @param ms - The timeout in milliseconds
 * @deprecated Use {@linkcode XCUITestDriver.scriptTimeoutW3C} instead
 */
export async function asyncScriptTimeout(this: XCUITestDriver, ms: number): Promise<void> {
  await this.scriptTimeoutW3C(ms);
}

/**
 * Sets the page load timeout.
 *
 * @param ms - Timeout in milliseconds
 */
export function setPageLoadTimeout(this: XCUITestDriver, ms: number): void {
  ms = parseInt(String(ms), 10);
  this.pageLoadMs = ms;
  if (this._remote) {
    this.remote.pageLoadMs = ms;
    if (this._remote.automationSession?.isStarted) {
      this._remote.automationSession.pageLoadTimeoutMs = ms;
    }
  }
  this.log.debug(`Set page load timeout to ${ms}ms`);
}

/**
 * Sets the async script timeout.
 *
 * @param ms - Timeout in milliseconds
 */
export function setAsyncScriptTimeout(this: XCUITestDriver, ms: number): void {
  this.asyncWaitMs = ms;
  if (this._remote?.automationSession?.isStarted) {
    this._remote.automationSession.scriptTimeoutMs = ms;
  }
  this.log.debug(`Set async script timeout to ${ms}ms`);
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
  if (this._remote?.automationSession?.isStarted) {
    this._remote.automationSession.implicitWaitTimeoutMs = ms;
  }
}
