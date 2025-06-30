import { isIos18OrNewer } from '../utils.js';

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
    let batteryInfoFromShimService;
    if (isIos18OrNewer(this.opts)) {
      // TODO: Remove this once we publish the appium-ios-remotexpc package to npm
      // @ts-expect-error
      const {Services} = await import('appium-ios-remotexpc');
      const diagService = await Services.startDiagnosticsService(this.device.udid);
      batteryInfoFromShimService = await diagService.ioregistry({
        ioClass: 'IOPMPowerSource',
        returnRawJson: true,
      });
    }

    const batteryInfoFromWda = /** @type {import('./battery-types.js').BatteryInfo} */ (
      await this.proxyCommand('/wda/batteryInfo', 'GET')
    );
    return {...batteryInfoFromWda, ...batteryInfoFromShimService};
  },
};

/**
 * @typedef {import('./battery-types.js').BatteryInfo} BatteryInfo
 */
