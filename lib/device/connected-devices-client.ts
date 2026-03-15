import _ from 'lodash';
import {Devicectl} from 'node-devicectl';
import {utilities} from 'appium-ios-device';
import {log} from '../logger';
import {isIos18OrNewer} from '../utils';
import type {XCUITestDriverOpts} from '../driver';

type RemoteXPCServices = typeof import('appium-ios-remotexpc').Services;


export class ConnectedDevicesClient {
  private constructor(private readonly services: RemoteXPCServices | null) {}

  /**
   * Create a connected devices client instance.
   * When opts indicate iOS/tvOS 18+, loads and stores the remotexpc Services
   * instance for tunnel registry listing; otherwise uses legacy listing only.
   */
  static async create(opts: XCUITestDriverOpts): Promise<ConnectedDevicesClient> {
    let services: RemoteXPCServices | null = null;
    if (isIos18OrNewer(opts)) {
      try {
        const remotexpcModule = await import('appium-ios-remotexpc');
        services = remotexpcModule.Services;
      } catch {
        log.warn(
          'Could not load appium-ios-remotexpc, using legacy devices listing instead',
        );
      }
    }
    return new ConnectedDevicesClient(services);
  }

  /**
   * Returns the list of connected real device UDIDs.
   * Merges tunnel registry (when available) with legacy listing (devicectl or appium-ios-device).
   */
  async getConnectedDevices(): Promise<string[]> {
    const [tunnelUdids, legacyUdids] = await Promise.all([
      this.getTunnelRegistryUdids(),
      this.getLegacyUdids(),
    ]);
    return _.uniq([...tunnelUdids, ...legacyUdids]);
  }

  private isPreferDevicectlEnabled(): boolean {
    return ['yes', 'true', '1'].includes(
      _.toLower(process.env.APPIUM_XCUITEST_PREFER_DEVICECTL ?? ''),
    );
  }

  private async getTunnelRegistryUdids(): Promise<string[]> {
    if (!this.services?.getAvailableDevices) {
      return [];
    }
    try {
      return await this.services.getAvailableDevices();
    } catch (err) {
      log.warn(
        'Failed to get tunnel registry device list, using legacy devices listing instead. ' +
          `Original error: ${(err as Error).message}`,
      );
      return [];
    }
  }

  private async getLegacyUdids(): Promise<string[]> {
    if (this.isPreferDevicectlEnabled()) {
      return (await new Devicectl('').listDevices())
        .map(({hardwareProperties}) => hardwareProperties?.udid)
        .filter(Boolean);
    }
    return await utilities.getConnectedDevices();
  }
}
