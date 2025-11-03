import log from '../logger.js';
import { isIos18OrNewer } from '../utils.js';

/**
 * Reads the battery information from the device under test.
 *
 * This endpoint only returns reliable result on real devices.
 *
 * @returns {Promise<import('./types').BatteryInfo & {advanced: Record<string, any>}>}
 * @this {import('../driver').XCUITestDriver}
 */
export async function mobileGetBatteryInfo() {
  let batteryInfoFromShimService;
  if (isIos18OrNewer(this.opts) && this.isRealDevice()) {
    let remoteXPCConnection;
    try {
      const {Services} = await import('appium-ios-remotexpc');
      let { diagnosticsService, remoteXPC } = await Services.startDiagnosticsService(this.device.udid);
      remoteXPCConnection = remoteXPC;
      batteryInfoFromShimService = await diagnosticsService.ioregistry({
        ioClass: 'IOPMPowerSource',
        returnRawJson: true,
      });
    } catch (err) {
      log.error(`Failed to get battery info from DiagnosticsService: ${err.message}`);
    } finally {
      if (remoteXPCConnection) {
        log.info(`Closing remoteXPC connection for device ${this.device.udid}`);
        await remoteXPCConnection.close();
      }
    }
  }

  const batteryInfoFromWda = /** @type {import('./types').BatteryInfo}} */ (
    await this.proxyCommand('/wda/batteryInfo', 'GET')
  );
  return {
    ...batteryInfoFromWda,
    advanced: batteryInfoFromShimService || {},
  };
}

/**
 * @typedef {import('./types').BatteryInfo} BatteryInfo
 */
