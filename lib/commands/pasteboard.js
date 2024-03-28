export default {
  /**
   * Sets the Simulator's pasteboard content to the given value.
   *
   * Does not work for real devices.
   * @param {string} content - The content to set
   * @param {string} encoding - The content's encoding
   * @group Simulator Only
   * @returns {Promise<void>}
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
    return await /** @type {import('../driver').Simulator} */ (this.device).simctl.setPasteboard(
      content, /** @type {BufferEncoding} */ (encoding)
    );
  },

  /**
   * Gets the Simulator's pasteboard content.
   *
   * Does not work for real devices.
   * @param {string} encoding - Expected encoding of returned string
   * @group Simulator Only
   * @this {XCUITestDriver}
   * @returns {Promise<string>} The pasteboard content string
   */
  async mobileGetPasteboard(encoding = 'utf8') {
    if (!this.isSimulator()) {
      throw new Error('Getting pasteboard content is not supported on real devices');
    }
    return await /** @type {import('../driver').Simulator} */ (this.device).simctl.getPasteboard(encoding);
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
