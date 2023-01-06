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
    await this.asyncScriptTimeout(ms);
  },
  /**
   * @this {XCUITestDriver}
   */
  async scriptTimeoutMJSONWP(ms) {
    await this.asyncScriptTimeout(ms);
  },
  /**
   * @this {XCUITestDriver}
   */
  // eslint-disable-next-line require-await
  async asyncScriptTimeout(ms) {
    this.setAsyncScriptTimeout(this.parseTimeoutArgument(ms));
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
