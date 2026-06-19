import {Devicectl} from 'node-devicectl';
import {utilities} from 'appium-ios-device';
import {log} from '../logger';
import type {XCUITestDriverOpts} from '../driver';
import {formatRemoteXPCFallbackLog, RemoteXPCFacade, type RemoteXPCServices} from './remote-xpc';

export class ConnectedDevicesClient {
  private constructor(private readonly services: RemoteXPCServices | null) {}

  /**
   * Create a connected devices client instance.
   * When opts indicate iOS/tvOS 18+, loads and stores the remotexpc Services
   * instance for tunnel registry listing; otherwise uses legacy listing only.
   */
  static async create(opts: XCUITestDriverOpts): Promise<ConnectedDevicesClient> {
    const services = await RemoteXPCFacade.tryGetServicesStatic(opts.platformVersion);
    return new ConnectedDevicesClient(services);
  }

  /**
   * Returns the list of connected real device UDIDs.
   * Only considers tunnel registry UDIDs when remotexpc is loaded and tunnels are running;
   * otherwise returns the legacy list only.
   */
  async getConnectedDevices(): Promise<string[]> {
    const [tunnelSettled, legacySettled] = await Promise.allSettled([
      this.listUdidsFromTunnelsRegistry(),
      this.listLegacyUdids(),
    ]);

    // Tunnels succeeded → short-circuit: return tunnel UDIDs only (legacy not used)
    if (tunnelSettled.status === 'fulfilled') {
      return tunnelSettled.value;
    }

    // Tunnels rejected (only other status after fulfilled) → use legacy; throw if legacy failed
    const err = tunnelSettled.reason;
    log.warn(formatRemoteXPCFallbackLog('devices listing', err));
    if (legacySettled.status === 'rejected') {
      throw legacySettled.reason instanceof Error
        ? legacySettled.reason
        : new Error(String(legacySettled.reason));
    }
    return legacySettled.value;
  }

  private isPreferDevicectlEnabled(): boolean {
    return ['yes', 'true', '1'].includes(
      String(process.env.APPIUM_XCUITEST_PREFER_DEVICECTL ?? '').toLowerCase(),
    );
  }

  /**
   * Fetches UDIDs from the tunnel registry.
   * @throws When remotexpc is not loaded or when the tunnel registry is unreachable.
   */
  private async listUdidsFromTunnelsRegistry(): Promise<string[]> {
    if (!this.services) {
      throw new Error('appium-ios-remotexpc module cannot be loaded');
    }
    return await this.services.getAvailableDevices();
  }

  private async listLegacyUdids(): Promise<string[]> {
    if (this.isPreferDevicectlEnabled()) {
      return (await new Devicectl('').listDevices())
        .map(({hardwareProperties}) => hardwareProperties?.udid)
        .filter(Boolean);
    }
    return await utilities.getConnectedDevices();
  }
}
