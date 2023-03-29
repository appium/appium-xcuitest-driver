export default {
  /**
   * Reads the battery information from the device under test.
   * This endpoint only returns reliable result on real devices.
   *
   * @returns {Promise<import('./types').BatteryInfo>} The actual battery info
   * @this {import('../driver').XCUITestDriver}
   */
  async mobileGetBatteryInfo() {
    return await this.proxyCommand('/wda/batteryInfo', 'GET');
  },
};
