import {utilities} from 'appium-ios-device';
import type {XCUITestDriver} from '../driver';
import type {DeviceInfo, LockdownInfo} from './types';

/**
 * Returns the miscellaneous information about the device under test.
 *
 * Since XCUITest driver v4.2.0, this includes device information via lockdown in a real device.
 *
 * @returns The response of `/wda/device/info'`
 */
export async function mobileGetDeviceInfo(
  this: XCUITestDriver,
): Promise<DeviceInfo | (DeviceInfo & {lockdownInfo: LockdownInfo})> {
  const infoByWda = await this.proxyCommand<unknown, DeviceInfo>('/wda/device/info', 'GET');

  if (this.isRealDevice()) {
    const lockdownInfo = await utilities.getDeviceInfo(this.device.udid);
    return {...infoByWda, ...{lockdownInfo}};
  }

  return infoByWda;
}
