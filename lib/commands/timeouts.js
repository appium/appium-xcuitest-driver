const commands = {
  /**
   * @this {XCUITestDriver}
   */
  async pageLoadTimeoutW3C(ms) {
    await this.setPageLoadTimeout(this.parseTimeoutArgument(ms));
  },
  /**
   * @this {XCUITestDriver}
   */
  async pageLoadTimeoutMJSONWP(ms) {
    await this.setPageLoadTimeout(this.parseTimeoutArgument(ms));
  },

  /**
   * @this {XCUITestDriver}
   */
  async scriptTimeoutW3C(ms) {
    // XXX: this is synchronous
    await this.setAsyncScriptTimeout(this.parseTimeoutArgument(ms));
  },

  /**
   * Alias for {@linkcode XCUITestDriver.scriptTimeoutW3C}.
   *
   * @param {number} ms - the timeout
   * @this {XCUITestDriver}
   * @deprecated Use {@linkcode XCUITestDriver.scriptTimeoutW3C} instead
   */
  async scriptTimeoutMJSONWP(ms) {
    await this.asyncScriptTimeout(ms);
  },

  /**
   * Alias for {@linkcode XCUITestDriver.scriptTimeoutW3C}.
   *
   * @param {number} ms - the timeout
   *
   * @deprecated Use {@linkcode XCUITestDriver.scriptTimeoutW3C} instead
   * @this {XCUITestDriver}
   */
  async asyncScriptTimeout(ms) {
    await this.scriptTimeoutW3C(ms);
  },
};

const helpers = {
  /**
   * @this {XCUITestDriver}
   */
  setPageLoadTimeout(ms) {
    ms = parseInt(ms, 10);
    this.pageLoadMs = ms;
    if (this.remote) {
      this.remote.pageLoadMs = this.pageLoadMs;
    }
    this.log.debug(`Set page load timeout to ${ms}ms`);
  },
  /**
   * @this {XCUITestDriver}
   */
  setAsyncScriptTimeout(ms) {
    this.asyncWaitMs = ms;
    this.log.debug(`Set async script timeout to ${ms}ms`);
  },
};

export default {...helpers, ...commands};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
