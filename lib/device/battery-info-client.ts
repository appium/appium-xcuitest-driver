import {getRemoteXPCServices} from './remotexpc-utils';

/**
 * IOPMPowerSource IORegistry payload from the diagnostics relay (RemoteXPC shim).
 */
export type AdvancedBatteryInfo = Record<string, any>;

/**
 * Advanced battery metrics from the device diagnostics service on real hardware.
 *
 * Requires **iOS/tvOS 18+** and the optional **`appium-ios-remotexpc`** package.
 */
export class BatteryInfoClient {
  constructor(private readonly udid: string) {}

  /**
   * Reads IOPMPowerSource data via RemoteXPC diagnostics.
   */
  async getAdvancedInfo(): Promise<AdvancedBatteryInfo> {
    const Services = await getRemoteXPCServices();
    const diagnosticsService = await Services.startDiagnosticsService(this.udid);
    return await diagnosticsService.ioregistry({
      ioClass: 'IOPMPowerSource',
      returnRawJson: true,
    });
  }
}
