export default {
  /**
   * Returns ActiveApp info.
   *
   * @returns {Promise<object>} The response of `/wda/activeAppInfo'`
   * @throws {Error} if an error raised by command
   * @this {import('../driver').XCUITestDriver}
   */
  async mobileGetActiveAppInfo() {
    return await this.proxyCommand('/wda/activeAppInfo', 'GET');
  },
};
