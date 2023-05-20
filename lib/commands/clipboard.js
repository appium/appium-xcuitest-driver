export default {
  /**
   * Sets the primary clipboard's content on the device under test.
   *
   * @param {string} content - The content to be set as base64 encoded string.
   * @param {string} [contentType=plaintext] - The type of the content to set.
   *                                            Only `plaintext`, 'image and 'url' are supported.
   * @this {XCUITestDriver}
   */
  async setClipboard(content, contentType) {
    await this.proxyCommand('/wda/setPasteboard', 'POST', {
      content,
      contentType,
    });
  },

  /**
   * Gets the content of the primary clipboard on the device under test.
   *
   * @param {string} [contentType=plaintext] - The type of the content to get.
   *                                            Only `plaintext`, 'image and 'url' are supported.
   * @returns {Promise<string>} The actual clipboard content encoded into base64 string.
   * An empty string is returned if the clipboard contains no data.
   * @this {XCUITestDriver}
   */
  async getClipboard(contentType) {
    return /** @type {string} */ (
      await this.proxyCommand('/wda/getPasteboard', 'POST', {
        contentType,
      })
    );
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
