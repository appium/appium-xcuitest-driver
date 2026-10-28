import type {LockdownService} from 'appium-ios-remotexpc';

import type {LockdownInfo} from '../commands/types.js';
import type {RemoteXPCFacade} from './remote-xpc/index.js';

/**
 * Fields needed to format the device local time.
 */
export interface DeviceTimeLockdownFields {
  /** UTC timestamp in seconds since 1970-01-01T00:00:00Z */
  timestamp: number;
  /** UTC offset in minutes */
  utcOffset: number;
}

interface CreateLockdownClientOptions {
  facade: RemoteXPCFacade;
}

/**
 * Lockdown access for real devices on top of appium-ios-remotexpc: lockdown over usbmux when the
 * device is listed there, otherwise lockdown over the RSD tunnel (`createLockdownServiceForTunnel`).
 */
export class LockdownClient {
  private constructor(
    private readonly udid: string,
    private readonly strategy: 'remotexpc-usbmux' | 'remotexpc-tunnel',
    private readonly remoteXPCFacade: RemoteXPCFacade,
  ) {}

  /**
   * @param udid - Device UDID
   * @param opts - Creation options
   */
  static async createForDevice(udid: string, opts: CreateLockdownClientOptions): Promise<LockdownClient> {
    const {facade} = opts;
    const strategy = await facade.resolveLockdownStrategy();
    return new LockdownClient(udid, strategy, facade);
  }

  private static coerceFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'bigint') {
      const converted = Number(value);
      return Number.isFinite(converted) ? converted : undefined;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  async close(): Promise<void> {
    // Tunnel strategy opens lockdown per operation; nothing to close here.
  }

  /**
   * Full lockdown `GetValue` payload (`GetValue` with no key/domain).
   */
  async getDeviceInfo(): Promise<LockdownInfo> {
    return (await this.runWithRemotexpcLockdownRequiringValue(
      (lockdown) => lockdown.getDeviceInfo(),
      'device info payload',
    )) as LockdownInfo;
  }

  /**
   * Device ProductVersion from lockdown.
   *
   * Uses the same lockdown selection strategy as {@linkcode getDeviceInfo}.
   * If a RemoteXPC lockdown payload does not include ProductVersion, throws.
   */
  async getOSVersion(): Promise<string> {
    return await this.runWithRemotexpcLockdownRequiringValue(
      (lockdown) => lockdown.getProductVersion(),
      'ProductVersion',
    );
  }

  /**
   * Fields needed to format device local time.
   */
  async getDeviceTimeFields(): Promise<DeviceTimeLockdownFields> {
    const readTimeFromLockdown = async (lockdown: LockdownService): Promise<DeviceTimeLockdownFields | undefined> => {
      const info = await lockdown.getDeviceInfo();
      const timestamp = LockdownClient.coerceFiniteNumber(info.TimeIntervalSince1970);
      const tzOffsetSeconds = LockdownClient.coerceFiniteNumber(info.TimeZoneOffsetFromUTC);
      if (timestamp === undefined || tzOffsetSeconds === undefined) {
        return undefined;
      }
      return {timestamp, utcOffset: tzOffsetSeconds / 60};
    };

    return await this.runWithRemotexpcLockdownRequiringValue(readTimeFromLockdown, 'device time fields');
  }

  private async runWithRemotexpcUsbmuxLockdown<T>(
    fn: (lockdown: LockdownService) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    return await this.remoteXPCFacade.withUsbMuxLockdown(fn);
  }

  private async runWithRemotexpcLockdown<T>(
    fn: (lockdown: LockdownService) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    switch (this.strategy) {
      case 'remotexpc-usbmux':
        return await this.runWithRemotexpcUsbmuxLockdown(fn);
      case 'remotexpc-tunnel':
        return await this.runWithTunnelLockdown(fn);
    }
  }

  private async runWithRemotexpcLockdownRequiringValue<T>(
    fn: (lockdown: LockdownService) => Promise<T | undefined>,
    valueName: string,
  ): Promise<T> {
    const value = await this.runWithRemotexpcLockdown(fn);
    if (!value) {
      throw new Error(
        `RemoteXPC ${this.getRemotexpcLockdownLabel()} lockdown did not return ${valueName} for '${this.udid}'.`,
      );
    }
    return value;
  }

  private getRemotexpcLockdownLabel(): 'USB' | 'tunnel' {
    return this.strategy === 'remotexpc-usbmux' ? 'USB' : 'tunnel';
  }

  private async runWithTunnelLockdown<T>(
    fn: (lockdown: LockdownService) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    return await this.remoteXPCFacade.withTunnelLockdown(fn);
  }
}
