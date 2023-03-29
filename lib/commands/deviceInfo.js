import {utilities} from 'appium-ios-device';
export default {
  /**
   * Returns device info.
   *
   * @returns {Promise<object>} The response of `/wda/device/info'`
   * @throws {Error} if an error raised by command
   * @this {import('../driver').XCUITestDriver}
   */
  async mobileGetDeviceInfo() {
    const infoByWda = await this.proxyCommand('/wda/device/info', 'GET');

    if (this.isRealDevice()) {
      // @ts-expect-error - do not assign arbitrary properties to `this.opts`
      const lockdownInfo = await utilities.getDeviceInfo(this.opts.device.udid);
      return {...infoByWda, ...{lockdownInfo}};
    }

    return infoByWda;
  },
};
