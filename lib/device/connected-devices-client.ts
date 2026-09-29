/** @ts-expect-error no types */
import {utilities} from 'appium-ios-device';
import {Devicectl} from 'node-devicectl';

import type {XCUITestDriverOpts} from '../driver.js';
import {log} from '../logger.js';
import {toErrorMessage} from '../utils/index.js';
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
   * Returns the case-insensitive union of tunnel registry and legacy real-device UDIDs.
   * Tunnel registry UDIDs come first, followed by legacy-only devices.
   * Uses either successful lookup, including an empty result, and throws only if both fail.
   */
  async getConnectedDevices(): Promise<string[]> {
    const [tunnelSettled, legacySettled] = await Promise.allSettled([
      this.listUdidsFromTunnelsRegistry(),
      this.listLegacyUdids(),
    ]);

    if (tunnelSettled.status === 'rejected' && legacySettled.status === 'rejected') {
      throw new Error(
        `Could not list connected devices: tunnel registry failed (${toErrorMessage(tunnelSettled.reason)}); ` +
          `legacy lookup failed (${toErrorMessage(legacySettled.reason)})`,
        {cause: new AggregateError([tunnelSettled.reason, legacySettled.reason], 'Both device lookups failed')},
      );
    }

    if (tunnelSettled.status === 'rejected') {
      log.warn(formatRemoteXPCFallbackLog('devices listing', tunnelSettled.reason));
    }
    if (legacySettled.status === 'rejected') {
      log.warn(
        `Legacy devices listing failed: ${toErrorMessage(legacySettled.reason)}. Using tunnel registry results.`,
      );
    }

    const tunnelUdids = tunnelSettled.status === 'fulfilled' ? tunnelSettled.value : [];
    const legacyUdids = legacySettled.status === 'fulfilled' ? legacySettled.value : [];
    const seen = new Set<string>();
    const result: string[] = [];

    // Preserve tunnel registry spelling and order, then append unseen legacy-only devices.
    for (const udid of [...tunnelUdids, ...legacyUdids]) {
      const key = udid.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(udid);
      }
    }
    return result;
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
