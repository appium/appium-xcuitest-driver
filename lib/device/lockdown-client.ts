import type {AppiumLogger} from '@appium/types';
import {utilities} from 'appium-ios-device';
import type {RemoteXpcConnection} from 'appium-ios-remotexpc';
import type {LockdownInfo} from '../commands/types';
import type {XCUITestDriverOpts} from '../driver';
import {log as defaultLogger} from '../logger';
import {isIos18OrNewer} from '../utils';
import {
  getLastRemoteXPCOptionalImportError,
  tryGetRemoteXPCUsbMuxStrategy,
  type RemoteXPCEsmModule,
} from './remotexpc-utils';

/**
 * Shape returned by {@linkcode utilities.getDeviceTime} in appium-ios-device.
 */
export interface DeviceTimeLockdownFields {
  /** UTC timestamp in seconds since 1970-01-01T00:00:00Z */
  timestamp: number;
  /** UTC offset in minutes */
  utcOffset: number;
}

type LockdownServiceInstance = Awaited<
  ReturnType<RemoteXPCEsmModule['createLockdownServiceByTunnel']>
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
    private readonly remotexpc: RemoteXPCEsmModule | null,
    private readonly strategy: 'ios-device' | 'remotexpc-usbmux' | 'remotexpc-tunnel',
    private readonly remoteXpcConnection: RemoteXpcConnection | null,
  ) {}

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
    const resolved = await tryGetRemoteXPCUsbMuxStrategy(udid, log);
    if (!resolved) {
      const err = getLastRemoteXPCOptionalImportError();
      log.warn(
        `appium-ios-remotexpc unavailable for lockdown on '${udid}': ${err?.message ?? 'unknown'}. ` +
          `Using appium-ios-device lockdown (legacy fallback).`,
      );
      return new LockdownClient(udid, log, null, 'ios-device', null);
    }
    const {remotexpc, useUsbMuxPath} = resolved;

    if (useUsbMuxPath) {
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
    if (this.remoteXpcConnection) {
      try {
        await this.remoteXpcConnection.close();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Full lockdown `GetValue` payload (`GetValue` with no key/domain).
   */
  async getDeviceInfo(): Promise<LockdownInfo> {
    if (this.strategy === 'ios-device') {
      return await utilities.getDeviceInfo(this.udid);
    }
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
    if (this.strategy === 'ios-device') {
      return await utilities.getOSVersion(this.udid);
    }
    return await this.runWithRemotexpcLockdownRequiringValue(
      (lockdown) => lockdown.getProductVersion(),
      'ProductVersion',
    );
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
      case 'remotexpc-usbmux':
      case 'remotexpc-tunnel':
        return await this.runWithRemotexpcLockdownRequiringValue(
          readTimeFromLockdown,
          'device time fields',
        );
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

  private async runWithRemotexpcLockdown<T>(
    fn: (lockdown: LockdownServiceInstance) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    switch (this.strategy) {
      case 'remotexpc-usbmux':
        return await this.runWithRemotexpcUsbmuxLockdown(fn);
      case 'remotexpc-tunnel':
        return await this.runWithTunnelLockdown(fn);
      default:
        throw new Error(`RemoteXPC lockdown is not active for '${this.udid}'.`);
    }
  }

  private async runWithRemotexpcLockdownRequiringValue<T>(
    fn: (lockdown: LockdownServiceInstance) => Promise<T | undefined>,
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
}
