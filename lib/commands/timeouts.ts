import type {XCUITestDriver} from '../driver';

/**
 * Sets the page load timeout using W3C protocol.
 *
 * @param ms - Timeout in milliseconds
 */
export async function pageLoadTimeoutW3C(
  this: XCUITestDriver,
  ms: number,
): Promise<void> {
  await this.setPageLoadTimeout(this.parseTimeoutArgument(ms));
}

/**
 * Sets the page load timeout using MJSONWP protocol.
 *
 * @param ms - Timeout in milliseconds
 */
export async function pageLoadTimeoutMJSONWP(
  this: XCUITestDriver,
  ms: number,
): Promise<void> {
  await this.setPageLoadTimeout(this.parseTimeoutArgument(ms));
}

/**
 * Sets the async script timeout using W3C protocol.
 *
 * @param ms - Timeout in milliseconds
 */
export async function scriptTimeoutW3C(
  this: XCUITestDriver,
  ms: number,
): Promise<void> {
  // XXX: this is synchronous
  await this.setAsyncScriptTimeout(this.parseTimeoutArgument(ms));
}

/**
 * Alias for {@linkcode XCUITestDriver.scriptTimeoutW3C}.
 *
 * @param ms - The timeout in milliseconds
 * @deprecated Use {@linkcode XCUITestDriver.scriptTimeoutW3C} instead
 */
export async function scriptTimeoutMJSONWP(
  this: XCUITestDriver,
  ms: number,
): Promise<void> {
  await this.asyncScriptTimeout(ms);
}

/**
 * Alias for {@linkcode XCUITestDriver.scriptTimeoutW3C}.
 *
 * @param ms - The timeout in milliseconds
 * @deprecated Use {@linkcode XCUITestDriver.scriptTimeoutW3C} instead
 */
export async function asyncScriptTimeout(
  this: XCUITestDriver,
  ms: number,
): Promise<void> {
  await this.scriptTimeoutW3C(ms);
}

/**
 * Sets the page load timeout.
 *
 * @param ms - Timeout in milliseconds
 */
export function setPageLoadTimeout(
  this: XCUITestDriver,
  ms: number,
): void {
  ms = parseInt(String(ms), 10);
  this.pageLoadMs = ms;
  if (this._remote) {
    this.remote.pageLoadMs = ms;
  }
  this.log.debug(`Set page load timeout to ${ms}ms`);
}

/**
 * Sets the async script timeout.
 *
 * @param ms - Timeout in milliseconds
 */
export function setAsyncScriptTimeout(
  this: XCUITestDriver,
  ms: number,
): void {
  this.asyncWaitMs = ms;
  this.log.debug(`Set async script timeout to ${ms}ms`);
}

