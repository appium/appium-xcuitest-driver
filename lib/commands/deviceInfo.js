import {utilities} from 'appium-ios-device';
export default {
  /**
   * Returns the miscellaneous information about the device under test.
   *
   * Since XCUITest driver v4.2.0, this includes device information via lockdown in a real device.
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
      return {...infoByWda, ...{lockdownInfo}};
    }

    return infoByWda;
  },
};

/**
 * @typedef {import('./types').DeviceInfo} DeviceInfo
 * @typedef {import('./types').LockdownInfo} LockdownInfo
 */
