export default {
  /**
   * Returns information about the active application.
   *
   * @returns {Promise<import('./types').ActiveAppInfo>} Active app information
   * @throws {Error} if an error raised by command
   * @this {import('../driver').XCUITestDriver}
   */
  async mobileGetActiveAppInfo() {
    return /** @type {import('./types').ActiveAppInfo} */ (
      await this.proxyCommand('/wda/activeAppInfo', 'GET')
    );
  },
};
