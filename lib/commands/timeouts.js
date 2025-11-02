/**
 * @this {XCUITestDriver}
 */
export async function pageLoadTimeoutW3C(ms) {
  await this.setPageLoadTimeout(this.parseTimeoutArgument(ms));
}

/**
 * @this {XCUITestDriver}
 */
export async function pageLoadTimeoutMJSONWP(ms) {
  await this.setPageLoadTimeout(this.parseTimeoutArgument(ms));
}

/**
 * @this {XCUITestDriver}
 */
export async function scriptTimeoutW3C(ms) {
  // XXX: this is synchronous
  await this.setAsyncScriptTimeout(this.parseTimeoutArgument(ms));
}

/**
 * Alias for {@linkcode XCUITestDriver.scriptTimeoutW3C}.
 *
 * @param {number} ms - the timeout
 * @this {XCUITestDriver}
 * @deprecated Use {@linkcode XCUITestDriver.scriptTimeoutW3C} instead
 */
export async function scriptTimeoutMJSONWP(ms) {
  await this.asyncScriptTimeout(ms);
}

/**
 * Alias for {@linkcode XCUITestDriver.scriptTimeoutW3C}.
 *
 * @param {number} ms - the timeout
 *
 * @deprecated Use {@linkcode XCUITestDriver.scriptTimeoutW3C} instead
 * @this {XCUITestDriver}
 */
export async function asyncScriptTimeout(ms) {
  await this.scriptTimeoutW3C(ms);
}

/**
 * @this {XCUITestDriver}
 */
export function setPageLoadTimeout(ms) {
  ms = parseInt(ms, 10);
  this.pageLoadMs = ms;
  if (this.remote) {
    this.remote.pageLoadMs = ms;
  }
  this.log.debug(`Set page load timeout to ${ms}ms`);
}

/**
 * @this {XCUITestDriver}
 */
export function setAsyncScriptTimeout(ms) {
  this.asyncWaitMs = ms;
  this.log.debug(`Set async script timeout to ${ms}ms`);
}

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
