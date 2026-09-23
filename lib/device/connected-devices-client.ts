/** @ts-expect-error no types */
import {utilities} from 'appium-ios-device';
import {Devicectl} from 'node-devicectl';

import type {XCUITestDriverOpts} from '../driver.js';
import {log} from '../logger.js';
import {formatRemoteXPCFallbackLog, RemoteXPCFacade, type RemoteXPCServices} from './remote-xpc/index.js';

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

    // Prefer tunnel UDIDs when present, but an empty registry must not hide legacy devices.
    if (tunnelSettled.status === 'fulfilled' && tunnelSettled.value.length > 0) {
      return tunnelSettled.value;
    }

    if (tunnelSettled.status === 'rejected') {
      log.warn(formatRemoteXPCFallbackLog('devices listing', tunnelSettled.reason));
    }
    // Registry unavailable or empty: use legacy; throw if legacy failed.
    if (legacySettled.status === 'rejected') {
      throw legacySettled.reason instanceof Error ? legacySettled.reason : new Error(String(legacySettled.reason));
    }
    return legacySettled.value;
  }

  private isPreferDevicectlEnabled(): boolean {
    return ['yes', 'true', '1'].includes(String(process.env.APPIUM_XCUITEST_PREFER_DEVICECTL ?? '').toLowerCase());
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
