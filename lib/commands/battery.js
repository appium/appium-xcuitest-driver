export default {
  /**
   * Reads the battery information from the device under test.
   * This endpoint only returns reliable result on real devices.
   *
   * @returns {BatteryInfo} The actual battery info
   * @this {import('../driver').XCUITestDriver}
   */
  async mobileGetBatteryInfo() {
    return await this.proxyCommand('/wda/batteryInfo', 'GET');
  },
};

/**
 * @typedef {Object} BatteryInfo
 *
 * @property {number} level - Battery level in range [0.0, 1.0], where
 *                            1.0 means 100% charge.
 * @property {0|1|2|3} state - Battery state. The following values are possible:
 *   UIDeviceBatteryStateUnknown = 0
 *   UIDeviceBatteryStateUnplugged = 1  // on battery, discharging
 *   UIDeviceBatteryStateCharging = 2   // plugged in, less than 100%
 *   UIDeviceBatteryStateFull = 3       // plugged in, at 100%
 */
