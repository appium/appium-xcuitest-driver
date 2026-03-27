import {LockdownClient} from '../device/lockdown-client';
import type {XCUITestDriver} from '../driver';
import type {DeviceInfo, LockdownInfo} from './types';

/**
 * Returns the miscellaneous information about the device under test.
 *
 * Since XCUITest driver v4.2.0, this includes device information via lockdown on real devices.
 * Lockdown retrieval uses {@linkcode LockdownClient}.
 *
 * @returns The response of `/wda/device/info'`
 */
export async function mobileGetDeviceInfo(
  this: XCUITestDriver,
): Promise<DeviceInfo | (DeviceInfo & {lockdownInfo: LockdownInfo})> {
  const infoByWda = await this.proxyCommand<unknown, DeviceInfo>('/wda/device/info', 'GET');

  if (this.isRealDevice()) {
    const lockdown = await LockdownClient.createForDevice(this.device.udid, this.opts, this.log);
    try {
      const lockdownInfo = await lockdown.getDeviceInfo();
      return {...infoByWda, lockdownInfo};
    } finally {
      await lockdown.close();
    }
  }

  return infoByWda;
}
