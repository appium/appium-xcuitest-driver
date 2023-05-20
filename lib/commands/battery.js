export default {
  /**
   * Reads the battery information from the device under test.
   *
   * This endpoint only returns reliable result on real devices.
   *
   * @returns {Promise<BatteryInfo>} The battery info
   * @this {import('../driver').XCUITestDriver}
   */
  async mobileGetBatteryInfo() {
    return /** @type {BatteryInfo} */ (await this.proxyCommand('/wda/batteryInfo', 'GET'));
  },
};

/**
 * @typedef {import('./types').BatteryInfo} BatteryInfo
 */
