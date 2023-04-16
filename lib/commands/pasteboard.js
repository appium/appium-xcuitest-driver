export default {
  /**
   * @param {string} content
   * @param {string} encoding
   * @this {XCUITestDriver}
   */
  async mobileSetPasteboard(content, encoding = 'utf8') {
    if (!this.isSimulator()) {
      throw new Error('Setting pasteboard content is not supported on real devices');
    }
    if (!content) {
      // can be empty string
      throw new Error('Pasteboard content is mandatory to set');
    }
    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    return await this.opts.device.simctl.setPasteboard(content, encoding);
  },

  /**
   * @param {string} encoding
   * @this {XCUITestDriver}
   */
  async mobileGetPasteboard(encoding = 'utf8') {
    if (!this.isSimulator()) {
      throw new Error('Getting pasteboard content is not supported on real devices');
    }
    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    return await this.opts.device.simctl.getPasteboard(encoding);
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
