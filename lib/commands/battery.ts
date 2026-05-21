import {BatteryInfoClient, type AdvancedBatteryInfo} from '../device/battery-info-client';
import {isIos18OrNewer} from '../utils';
import type {XCUITestDriver} from '../driver';
import type {BatteryInfo} from './types';

/**
 * Reads the battery information from the device under test.
 *
 * This endpoint only returns reliable result on real devices.
 *
 * @returns Battery information with advanced details
 */
export async function mobileGetBatteryInfo(
  this: XCUITestDriver,
): Promise<BatteryInfo & {advanced: AdvancedBatteryInfo}> {
  let batteryInfoFromShimService: AdvancedBatteryInfo = {};
  if (isIos18OrNewer(this.opts) && this.isRealDevice()) {
    try {
      batteryInfoFromShimService = await new BatteryInfoClient(this.device.udid).getAdvancedInfo();
    } catch (err: any) {
      this.log.error(`Failed to get battery info from DiagnosticsService: ${err.message}`);
    }
  }

  const batteryInfoFromWda = await this.proxyCommand<any, BatteryInfo>('/wda/batteryInfo', 'GET');
  return {
    ...batteryInfoFromWda,
    advanced: batteryInfoFromShimService,
  };
}
