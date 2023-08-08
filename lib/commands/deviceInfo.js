import {utilities, services, INSTRUMENT_CHANNEL} from 'appium-ios-device';
import log from './../logger';
export default {
  /**
   * Returns the miscellaneous information about the device under test.
   *
   * Since XCUITest driver v4.2.0, this includes device information via lockdown in a real device.
   * Since XCUITEst driver v4.34.0, tis includes device system and network information via
   * com.apple.instruments.server.services.deviceinfo in a real device if available.
   *
   * @returns {Promise<DeviceInfo | (DeviceInfo & LockdownInfo)>} The response of `/wda/device/info'`
   * @this {import('../driver').XCUITestDriver}
   */
  async mobileGetDeviceInfo() {
    const infoByWda = /** @type {import('./types').DeviceInfo} */ (
      await this.proxyCommand('/wda/device/info', 'GET')
    );

    if (this.isRealDevice()) {
      // @ts-expect-error - do not assign arbitrary properties to `this.opts`
      const lockdownInfo = await utilities.getDeviceInfo(this.opts.device.udid);

      let instrumentService;
      let systemInformation = {};
      let networkInformation = {};
      try {
        // @ts-expect-error - do not assign arbitrary properties to `this.opts`
        instrumentService = await services.startInstrumentService(this.opts.device.udid);
        // Selenium::WebDriver::Error::UnknownError: An unknown server-side error occurred while processing the command. Original error: Do not know how to serialize a BigInt
        systemInformation = await instrumentService.callChannel(
          INSTRUMENT_CHANNEL.DEVICE_INFO,
          'systemInformation',
        );
        networkInformation = await instrumentService.callChannel(
          INSTRUMENT_CHANNEL.DEVICE_INFO,
          'networkInformation',
        );
      } catch (err) {
        log.warn(
          `Failed to get device information via '${
            INSTRUMENT_CHANNEL.DEVICE_INFO
          }'. Original error: ${err.stderr || err.message}`,
        );
      } finally {
        if (instrumentService) {
          instrumentService.close();
        }
      }
      return {...infoByWda, ...{lockdownInfo}, ...{systemInformation}, ...{networkInformation}};
    }

    return infoByWda;
  },
};

/**
 * @typedef {import('./types').DeviceInfo} DeviceInfo
 * @typedef {import('./types').LockdownInfo} LockdownInfo
 */
