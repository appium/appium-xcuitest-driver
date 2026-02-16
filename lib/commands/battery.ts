import {isIos18OrNewer} from '../utils';
import type {XCUITestDriver} from '../driver';
import type {BatteryInfo} from './types';
import {getRemoteXPCServices} from '../device/remotexpc-utils';

/**
 * Reads the battery information from the device under test.
 *
 * This endpoint only returns reliable result on real devices.
 *
 * @returns Battery information with advanced details
 */
export async function mobileGetBatteryInfo(
  this: XCUITestDriver,
): Promise<BatteryInfo & {advanced: Record<string, any>}> {
  let batteryInfoFromShimService: Record<string, any> | undefined;
  if (isIos18OrNewer(this.opts) && this.isRealDevice()) {
    let remoteXPCConnection;
    try {
      const Services = await getRemoteXPCServices();
      const {diagnosticsService, remoteXPC} = await Services.startDiagnosticsService(
        this.device.udid,
      );
      remoteXPCConnection = remoteXPC;
      batteryInfoFromShimService = await diagnosticsService.ioregistry({
        ioClass: 'IOPMPowerSource',
        returnRawJson: true,
      });
    } catch (err: any) {
      this.log.error(`Failed to get battery info from DiagnosticsService: ${err.message}`);
    } finally {
      if (remoteXPCConnection) {
        this.log.info(`Closing remoteXPC connection for device ${this.device.udid}`);
        await remoteXPCConnection.close();
      }
    }
  }

  const batteryInfoFromWda = await this.proxyCommand<any, BatteryInfo>('/wda/batteryInfo', 'GET');
  return {
    ...batteryInfoFromWda,
    advanced: batteryInfoFromShimService || {},
  };
}
