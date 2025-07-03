import { isIos18OrNewer } from '../utils.js';
import log from '../logger.js';

export default {
  /**
   * Reads the battery information from the device under test.
   *
   * This endpoint only returns reliable result on real devices.
   *
   * @returns {Promise<import('./types').BatteryInfo & Partial<import('./advanced-battery-types').BatteryInfo>>}
   * @this {import('../driver').XCUITestDriver}
   */
  async mobileGetBatteryInfo() {
    let batteryInfoFromShimService;
    if (isIos18OrNewer(this.opts) && this.isRealDevice()) {
      let diagService;
      try {
        const {Services} = await import('appium-ios-remotexpc');
        diagService = await Services.startDiagnosticsService(this.device.udid);
        batteryInfoFromShimService = await diagService.ioregistry({
          ioClass: 'IOPMPowerSource',
          returnRawJson: true,
        });
      } catch (err) {
        log.error(`Failed to get battery info from DiagnosticsService: ${err.message}`);
      }
    }

    const batteryInfoFromWda = /** @type {import('./types').BatteryInfo}} */ (
      await this.proxyCommand('/wda/batteryInfo', 'GET')
    );
    return {...batteryInfoFromWda, ...batteryInfoFromShimService || {}};
  },
};

/**
 * @typedef {import('./types').BatteryInfo} BatteryInfo
 */
