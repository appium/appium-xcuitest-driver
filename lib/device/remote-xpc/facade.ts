import type {AppiumLogger} from '@appium/types';
import type {DevicePortForwarder, LockdownService} from 'appium-ios-remotexpc';

import {supportsApiLevel18} from '../../utils/index.js';
import {loadRemoteXPCModule} from './module-loader.js';
import {isDeviceListedInUsbmux} from './usbmux-utils.js';
import {
  isTunnelAvailabilityError,
  REMOTE_XPC_TUNNEL_SETUP_DOC_LINK,
  TUNNEL_CREATION_COMMAND,
  TunnelRequiredError,
  wrapRemoteXPCConnectionError,
  type RemoteXPCEsmModule,
  type RemoteXPCServices,
  type RemoteXPCTestAttachment,
  type RemoteXPCTestRunner,
  type TransportTier,
} from './utils.js';

/** Options handed to service operations so that every `Services.start*` call uses the session tier. */
export interface SessionServiceOptions {
  transport: TransportTier;
}

/**
 * Per-session RemoteXPC state. The transport tier (tunnel if available, else the temporary usbmux
 * fallback) is decided once and cached for the whole session.
 */
export class RemoteXPCFacade {
  private initPromise: Promise<void> | null = null;
  private module: RemoteXPCEsmModule | null = null;
  private _tier: TransportTier | null = null;
  private listedInUsbmux = false;

  constructor(
    readonly udid: string,
    private readonly platformVersion: string | undefined,
    private readonly log: AppiumLogger,
  ) {}

  /**
   * Resolves (once) which transport serves this session.
   *
   * @throws When the module cannot be loaded or the device is reachable neither through a tunnel nor over usbmux
   */
  async getTier(): Promise<TransportTier> {
    await this.ensureInitialized();
    if (!this._tier) {
      throw new Error(`The transport tier for '${this.udid}' has not been determined`);
    }
    return this._tier;
  }

  /**
   * Whether the session runs on the RemoteXPC tunnel (as opposed to the usbmux fallback).
   */
  async isTunnelTier(): Promise<boolean> {
    return (await this.getTier()) === 'tunnel';
  }

  /**
   * XCTestRunner class from the loaded module. Tunnel only.
   */
  async getXCTestRunner(): Promise<RemoteXPCTestRunner> {
    await this.assertTunnelTier('XCTest');
    return (await this.requireModule()).XCTestRunner;
  }

  /**
   * XCTestAttachment class from the loaded module. Tunnel only.
   */
  async getXCTestAttachment(): Promise<RemoteXPCTestAttachment> {
    await this.assertTunnelTier('XCTest attachment deletion');
    return (await this.requireModule()).XCTestAttachment;
  }

  /**
   * Resolves which RemoteXPC lockdown connector to use for this device (plain lockdownd queries,
   * which are not subject to the removal of the legacy lockdown services).
   */
  async resolveLockdownStrategy(): Promise<'remotexpc-usbmux' | 'remotexpc-tunnel'> {
    await this.requireModule();
    return (await this.isListedInUsbmux()) ? 'remotexpc-usbmux' : 'remotexpc-tunnel';
  }

  /**
   * Creates a RemoteXPC device port forwarder.
   */
  async createDevicePortForwarder(localPort: number, devicePort: number): Promise<DevicePortForwarder> {
    const mod = await this.requireModule();
    // a failed usbmuxd query is reported as "not listed", so the session tier is the second opinion
    if ((await this.isListedInUsbmux()) || (await this.getTier()) === 'usbmux') {
      this.log.debug(`Using RemoteXPC usbmux strategy for '${this.udid}'`);
      return new mod.DevicePortForwarder(localPort, devicePort, {
        primaryConnector: () => mod.connectViaUsbmux(this.udid, devicePort),
      });
    }

    this.log.debug(`Using RemoteXPC tunnel strategy for '${this.udid}'`);
    return new mod.DevicePortForwarder(localPort, devicePort, {
      primaryConnector: () => mod.connectViaTunnel(this.udid, devicePort),
    });
  }

  /**
   * Runs a lockdown operation over the usbmux path for this device.
   */
  async withUsbMuxLockdown<T>(
    operation: (lockdown: LockdownService) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    try {
      const mod = await this.requireModule();
      const {lockdownService} = await mod.createLockdownServiceByUDID(this.udid);
      try {
        return await operation(lockdownService);
      } finally {
        lockdownService.close();
      }
    } catch (err) {
      throw new Error(
        `Failed to read lockdown via appium-ios-remotexpc USBMUX path for '${this.udid}': ` +
          `${(err as Error).message}`,
        {cause: err},
      );
    }
  }

  /**
   * Runs a lockdown operation over the RSD tunnel for this device.
   */
  async withTunnelLockdown<T>(
    operation: (lockdown: LockdownService) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    try {
      const mod = await this.requireModule();
      const lockdown = await mod.createLockdownServiceForTunnel(this.udid);
      try {
        return await operation(lockdown);
      } finally {
        lockdown.close();
      }
    } catch (err) {
      throw wrapRemoteXPCConnectionError(err, `Tunnel lockdown failed for '${this.udid}'`);
    }
  }

  /**
   * Runs an operation on a service that either tier can serve; it must pass the received `{transport}`
   * to the `Services.start*` call.
   */
  async requireService<T>(
    feature: string,
    operation: (services: RemoteXPCServices, options: SessionServiceOptions) => Promise<T>,
  ): Promise<T> {
    const tier = await this.getTier();
    try {
      return await operation((await this.requireModule()).Services, {transport: tier});
    } catch (err) {
      throw this.wrapServiceError(feature, tier, err);
    }
  }

  /**
   * Runs an operation on a tunnel-only service.
   *
   * @throws {TunnelRequiredError} When the session runs without a tunnel
   */
  async requireTunnelService<T>(feature: string, operation: (services: RemoteXPCServices) => Promise<T>): Promise<T> {
    await this.assertTunnelTier(feature);
    try {
      return await operation((await this.requireModule()).Services);
    } catch (err) {
      throw this.wrapServiceError(feature, 'tunnel', err);
    }
  }

  /**
   * @throws {TunnelRequiredError} When the session runs without a tunnel
   */
  async assertTunnelTier(feature: string): Promise<void> {
    if ((await this.getTier()) !== 'tunnel') {
      throw new TunnelRequiredError(feature, this.udid, this.platformVersion);
    }
  }

  private wrapServiceError(feature: string, tier: TransportTier, err: unknown): Error {
    if (err instanceof TunnelRequiredError) {
      return err;
    }
    // e.g. UnsupportedTransportError: the service cannot be served over usbmux
    if (tier === 'usbmux' && isTunnelAvailabilityError(err)) {
      return new TunnelRequiredError(feature, this.udid, this.platformVersion);
    }
    return wrapRemoteXPCConnectionError(err, `Failed ${feature} via RemoteXPC for '${this.udid}'`);
  }

  private async ensureInitialized(): Promise<void> {
    if (this._tier) {
      return;
    }
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          await this.initialize();
        } catch (err) {
          // do not cache failures: the device may become reachable later
          this.initPromise = null;
          throw err;
        }
      })();
    }
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    const mod = await this.requireModule();

    // The tunnel service names (`*.shim.remote`) only exist on iOS/tvOS 18+
    const tunnelCapable = !this.platformVersion || supportsApiLevel18(this.platformVersion);
    // no point in waiting for a tunnel that cannot serve this device
    const {tunnel, usbmux} = await mod.Services.getAvailableTransports(
      this.udid,
      [],
      tunnelCapable ? {} : {tunnelWaitMs: 0},
    );

    if (tunnel && tunnelCapable) {
      this._tier = 'tunnel';
      this.log.debug(`RemoteXPC tier for '${this.udid}': tunnel`);
      return;
    }
    if (usbmux) {
      this._tier = 'usbmux';
      this.log.warn(this.formatUsbmuxTierWarning(tunnelCapable));
      return;
    }
    throw new Error(
      `The device '${this.udid}' is reachable neither through a RemoteXPC tunnel nor over usbmux. ` +
        `Make sure it is connected, unlocked and trusts this computer` +
        (tunnelCapable ? `, or start tunnels with \`${TUNNEL_CREATION_COMMAND}\`.` : '.'),
    );
  }

  private formatUsbmuxTierWarning(tunnelCapable: boolean): string {
    const reason = tunnelCapable
      ? 'No RemoteXPC tunnel is available'
      : `iOS/tvOS ${this.platformVersion} does not support the RemoteXPC tunnel services`;
    const hint = tunnelCapable ? ` Start tunnels with \`${TUNNEL_CREATION_COMMAND}\`.` : '';
    return (
      `${reason} for '${this.udid}'. Falling back to the legacy lockdown services over usbmux, which is ` +
      `temporary and limited: features that need a tunnel (e.g. crash reports, pasteboard, XCTest, ` +
      `DVT-based features) will fail.${hint} See ${REMOTE_XPC_TUNNEL_SETUP_DOC_LINK}`
    );
  }

  /** Only a positive answer is cached, so a transient usbmuxd failure does not stick for the session. */
  private async isListedInUsbmux(): Promise<boolean> {
    if (!this.listedInUsbmux) {
      this.listedInUsbmux = await isDeviceListedInUsbmux(await this.requireModule(), this.udid, this.log);
    }
    return this.listedInUsbmux;
  }

  private async requireModule(): Promise<RemoteXPCEsmModule> {
    if (this.module) {
      return this.module;
    }
    let loadedModule: RemoteXPCEsmModule;
    try {
      loadedModule = await loadRemoteXPCModule();
    } catch (err) {
      throw wrapRemoteXPCConnectionError(err, `RemoteXPC module is not available for '${this.udid}'`);
    }
    this.module = loadedModule;
    return loadedModule;
  }
}
