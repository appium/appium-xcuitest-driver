import {Devicectl} from 'node-devicectl';

import {log} from '../logger.js';
import {loadRemoteXPCModule} from './remote-xpc/module-loader.js';
import {listUsbmuxUdids} from './remote-xpc/usbmux-utils.js';
import type {RemoteXPCEsmModule} from './remote-xpc/utils.js';

export class ConnectedDevicesClient {
  private constructor(private readonly remoteXPC: RemoteXPCEsmModule | null) {}

  /**
   * Create a connected devices client instance.
   */
  static async create(): Promise<ConnectedDevicesClient> {
    let remoteXPC: RemoteXPCEsmModule | null = null;
    try {
      remoteXPC = await loadRemoteXPCModule();
    } catch (err) {
      log.debug(`Cannot load appium-ios-remotexpc for devices listing: ${(err as Error).message}`);
    }
    return new ConnectedDevicesClient(remoteXPC);
  }

  /**
   * Returns the UDIDs of the connected real devices, never throwing. Devices known only to usbmux
   * (or devicectl, if preferred) come first and tunnel registry devices last, so that picking the last
   * one prefers a device that has a tunnel.
   */
  async getConnectedDevices(): Promise<string[]> {
    const [registrySettled, hostSettled] = await Promise.allSettled([
      this.listUdidsFromTunnelsRegistry(),
      this.isPreferDevicectlEnabled() ? this.listUdidsFromDevicectl() : this.listUdidsFromUsbmux(),
    ]);

    const failures: string[] = [];
    const registryUdids = this.unwrap(registrySettled, 'tunnel registry', failures);
    const hostUdids = this.unwrap(hostSettled, 'host', failures);
    const knownToRegistry = new Set(registryUdids.map((udid) => udid.toLowerCase()));
    const udids = [...hostUdids.filter((udid) => !knownToRegistry.has(udid.toLowerCase())), ...registryUdids];
    if (udids.length === 0 && failures.length > 0) {
      log.info(`No connected real devices were found. ${failures.join('; ')}`);
    }
    return udids;
  }

  private unwrap(settled: PromiseSettledResult<string[]>, source: string, failures: string[]): string[] {
    if (settled.status === 'fulfilled') {
      return [...new Set(settled.value)];
    }
    // The registry is normally unreachable when no tunnel is running
    failures.push(`Cannot list the devices from the ${source}: ${settled.reason?.message}`);
    return [];
  }

  private isPreferDevicectlEnabled(): boolean {
    return ['yes', 'true', '1'].includes(String(process.env.APPIUM_XCUITEST_PREFER_DEVICECTL ?? '').toLowerCase());
  }

  /**
   * @throws When the tunnel registry is unreachable.
   */
  private async listUdidsFromTunnelsRegistry(): Promise<string[]> {
    return await this.requireRemoteXPC().Services.getAvailableDevices();
  }

  /**
   * @throws When usbmuxd is unreachable.
   */
  private async listUdidsFromUsbmux(): Promise<string[]> {
    return await listUsbmuxUdids(this.requireRemoteXPC());
  }

  private async listUdidsFromDevicectl(): Promise<string[]> {
    return (await new Devicectl('').listDevices())
      .map(({hardwareProperties}) => hardwareProperties?.udid)
      .filter(Boolean);
  }

  private requireRemoteXPC(): RemoteXPCEsmModule {
    if (!this.remoteXPC) {
      throw new Error('appium-ios-remotexpc module cannot be loaded');
    }
    return this.remoteXPC;
  }
}
