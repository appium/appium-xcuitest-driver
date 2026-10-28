import type {RemoteXPCFacade} from './remote-xpc/index.js';

/**
 * IOPMPowerSource IORegistry payload from the diagnostics relay.
 */
export type AdvancedBatteryInfo = Record<string, any>;

/**
 * Advanced battery metrics from the device diagnostics service on real hardware.
 */
export class BatteryInfoClient {
  constructor(
    private readonly udid: string,
    private readonly remoteXPCFacade: RemoteXPCFacade,
  ) {}

  /**
   * Reads IOPMPowerSource data via the diagnostics service.
   */
  async getAdvancedInfo(): Promise<AdvancedBatteryInfo> {
    const diagnosticsService = await this.remoteXPCFacade.requireService('diagnostics', (Services, options) =>
      Services.startDiagnosticsService(this.udid, options),
    );
    return await diagnosticsService.ioregistry({
      ioClass: 'IOPMPowerSource',
      returnRawJson: true,
    });
  }
}
