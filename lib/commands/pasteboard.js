export default {
  /**
   * @this {XCUITestDriver}
   */
  async mobileSetPasteboard(opts = {}) {
    if (!this.isSimulator()) {
      throw new Error('Setting pasteboard content is not supported on real devices');
    }
    const {content, encoding} = opts;
    if (!content) {
      throw new Error('Pasteboard content is mandatory to set');
    }
    return await this.opts.device.simctl.setPasteboard(content, encoding);
  },

  /**
   * @this {XCUITestDriver}
   */
  async mobileGetPasteboard(opts = {}) {
    if (!this.isSimulator()) {
      throw new Error('Getting pasteboard content is not supported on real devices');
    }
    return await this.opts.device.simctl.getPasteboard(opts.encoding);
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
