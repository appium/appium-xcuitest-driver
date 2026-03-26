import type {AppiumLogger} from '@appium/types';
import {utilities} from 'appium-ios-device';
import type {RemoteXpcConnection} from 'appium-ios-remotexpc';
import type {LockdownInfo} from '../commands/types';
import type {XCUITestDriverOpts} from '../driver';
import {log as defaultLogger} from '../logger';
import {isIos18OrNewer} from '../utils';

/**
 * Shape returned by {@linkcode utilities.getDeviceTime} in appium-ios-device.
 */
export interface DeviceTimeLockdownFields {
  /** UTC timestamp in seconds since 1970-01-01T00:00:00Z */
  timestamp: number;
  /** UTC offset in minutes */
  utcOffset: number;
}

type RemotexpcModuleLike = typeof import('appium-ios-remotexpc');
type LockdownServiceInstance = Awaited<
  ReturnType<RemotexpcModuleLike['createLockdownServiceByTunnel']>
>;

/**
 * Unified lockdown access for real devices.
 *
 * On iOS/tvOS 18+ attempts a tunnel registry RemoteXPC connection and lockdown over RSD
 * (`createLockdownServiceByTunnel`). When that path is unavailable, uses
 * {@linkcode utilities} from `appium-ios-device` (USB/local usbmux).
 */
export class LockdownClient {
  private constructor(
    private readonly udid: string,
    private readonly log: AppiumLogger,
    private readonly remotexpc: RemotexpcModuleLike | null,
    private readonly strategy: 'ios-device' | 'remotexpc-usbmux' | 'remotexpc-tunnel',
    private readonly remoteXpcConnection: RemoteXpcConnection | null,
  ) {}

  async close(): Promise<void> {
    if (this.remoteXpcConnection) {
      try {
        await this.remoteXpcConnection.close();
      } catch {
        // ignore
      }
    }
  }

  /**
   * @param udid - Device UDID
   * @param opts - Driver options (used for iOS version gating)
   * @param log - Logger
   */
  static async createForDevice(
    udid: string,
    opts: XCUITestDriverOpts,
    log: AppiumLogger = defaultLogger,
  ): Promise<LockdownClient> {
    if (!isIos18OrNewer(opts)) {
      return new LockdownClient(udid, log, null, 'ios-device', null);
    }
    let remotexpc: RemotexpcModuleLike;
    try {
      remotexpc = (await import('appium-ios-remotexpc')) as RemotexpcModuleLike;
    } catch (err) {
      log.warn(
        `appium-ios-remotexpc unavailable for lockdown on '${udid}': ${(err as Error).message}. ` +
          `Using appium-ios-device lockdown (legacy fallback).`,
      );
      return new LockdownClient(udid, log, null, 'ios-device', null);
    }

    let listedByUsbmux = false;
    const usbmux = await remotexpc.createUsbmux();
    try {
      const devices = await usbmux.listDevices();
      listedByUsbmux = devices.some((x) => x.Properties?.SerialNumber === udid);
    } finally {
      await usbmux.close();
    }

    if (listedByUsbmux) {
      return new LockdownClient(udid, log, remotexpc, 'remotexpc-usbmux', null);
    }

    if (typeof remotexpc.createLockdownServiceByTunnel !== 'function') {
      throw new Error(
        `appium-ios-remotexpc does not provide createLockdownServiceByTunnel for tunnel-only ` +
          `device '${udid}'. Please upgrade appium-ios-remotexpc.`,
      );
    }
    const {remoteXPC} = await remotexpc.Services.createRemoteXPCConnection(udid);
    return new LockdownClient(udid, log, remotexpc, 'remotexpc-tunnel', remoteXPC);
  }

  /**
   * Full lockdown `GetValue` payload (`GetValue` with no key/domain).
   */
  async getDeviceInfo(): Promise<LockdownInfo> {
    switch (this.strategy) {
      case 'ios-device':
        return await utilities.getDeviceInfo(this.udid);
      case 'remotexpc-usbmux':
        return (await this.runWithRemotexpcUsbmuxLockdown((lockdown) =>
          lockdown.getDeviceInfo(),
        )) as LockdownInfo;
      case 'remotexpc-tunnel':
        return (await this.runWithTunnelLockdown((lockdown) =>
          lockdown.getDeviceInfo(),
        )) as LockdownInfo;
    }
  }

  /**
   * Fields needed to format device local time (same contract as {@linkcode utilities.getDeviceTime}).
   */
  async getDeviceTimeFields(): Promise<DeviceTimeLockdownFields> {
    const readTimeFromLockdown = async (
      lockdown: LockdownServiceInstance,
    ): Promise<DeviceTimeLockdownFields | undefined> => {
      const info = await lockdown.getDeviceInfo();
      const timestamp = LockdownClient.coerceFiniteNumber(info.TimeIntervalSince1970);
      const tzOffsetSeconds = LockdownClient.coerceFiniteNumber(info.TimeZoneOffsetFromUTC);
      if (timestamp === undefined || tzOffsetSeconds === undefined) {
        return undefined;
      }
      return {timestamp, utcOffset: tzOffsetSeconds / 60};
    };

    switch (this.strategy) {
      case 'ios-device': {
        const {timestamp, utcOffset, timeZone} = await utilities.getDeviceTime(this.udid);
        return {
          timestamp,
          utcOffset: this.normalizeUtcOffsetMinutes(utcOffset, timeZone),
        };
      }
      case 'remotexpc-usbmux': {
        const value = await this.runWithRemotexpcUsbmuxLockdown(readTimeFromLockdown);
        if (!value) {
          throw new Error(
            `RemoteXPC USB lockdown did not return device time fields for '${this.udid}'.`,
          );
        }
        return value;
      }
      case 'remotexpc-tunnel': {
        const value = await this.runWithTunnelLockdown(readTimeFromLockdown);
        if (!value) {
          throw new Error(
            `RemoteXPC tunnel lockdown did not return device time fields for '${this.udid}'.`,
          );
        }
        return value;
      }
    }
  }

  /**
   * Legacy ios-device can provide inconsistent offset payloads. Normalize to a final offset in
   * minutes for consumers.
   */
  private normalizeUtcOffsetMinutes(utcOffset: number, timeZone: string | number): number {
    // Normal/expected: offset already in minutes.
    if (Math.abs(utcOffset) <= 12 * 60) {
      return utcOffset;
    }
    // Sometimes `timeZone` is a numeric offset in seconds.
    const offsetSeconds = typeof timeZone === 'number' ? timeZone : Number(timeZone);
    if (Number.isFinite(offsetSeconds) && Math.abs(offsetSeconds) <= 12 * 60 * 60) {
      return offsetSeconds / 60;
    }
    this.log.warn(
      `Did not know how to apply UTC offset from lockdown (utcOffset=${utcOffset}, timeZone=${timeZone}). ` +
        `Using UTC.`,
    );
    return 0;
  }

  private async runWithRemotexpcUsbmuxLockdown<T>(
    fn: (lockdown: LockdownServiceInstance) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    if (!this.remotexpc) {
      throw new Error(`appium-ios-remotexpc module is not initialized for '${this.udid}'.`);
    }
    try {
      const {lockdownService} = await this.remotexpc.createLockdownServiceByUDID(this.udid);
      try {
        return await fn(lockdownService);
      } finally {
        lockdownService.close();
      }
    } catch (err) {
      throw new Error(
        `Failed to read lockdown via appium-ios-remotexpc USBMUX path for '${this.udid}': ` +
          `${(err as Error).message}`,
      );
    }
  }

  /**
   * Runs an operation with lockdown over the RSD tunnel.
   */
  private async runWithTunnelLockdown<T>(
    fn: (lockdown: LockdownServiceInstance) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    if (!this.remotexpc || !this.remoteXpcConnection) {
      throw new Error(`RemoteXPC tunnel is not initialized for '${this.udid}'.`);
    }
    try {
      const lockdown = await this.remotexpc.createLockdownServiceByTunnel(
        this.remoteXpcConnection,
        this.udid,
      );
      try {
        return await fn(lockdown);
      } finally {
        lockdown.close();
      }
    } catch (err) {
      throw new Error(`Tunnel lockdown failed for '${this.udid}': ${(err as Error).message}`);
    }
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
}
