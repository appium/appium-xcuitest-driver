import type {AppiumLogger} from '@appium/types';
import type {DevicePortForwarder, LockdownService} from 'appium-ios-remotexpc';
import {isIos18OrNewerPlatform} from '../../utils';
import {isDeviceListedInUsbmux} from './usbmux-utils';
import {
  formatRemoteXPCFallbackLog,
  isTunnelAvailabilityError,
  RemoteXPCUnavailableError,
  wrapRemoteXPCConnectionError,
  type RemoteXPCEsmModule,
  type RemoteXPCServices,
  type RemoteXPCTestAttachment,
  type RemoteXPCTestRunner,
} from './utils';
import {getLastRemoteXPCImportError, tryLoadRemoteXPCModule} from './module-loader';

const TUNNEL_REGISTRY_PORT_PROBE_TIMEOUT_MS = 3000;

/**
 * Per-driver-session RemoteXPC availability state.
 *
 * Initialized lazily on the first remotexpc operation. When the initial tunnel registry probe
 * fails with {@link isTunnelAvailabilityError}, remotexpc is disabled for the remainder of the
 * session so callers fall back to appium-ios-device without re-probing on every service call.
 * Later per-operation tunnel failures do not flip that cached state.
 */
export class RemoteXPCFacade {
  private initPromise: Promise<void> | null = null;
  private initialized = false;
  private enabled = false;
  private module: RemoteXPCEsmModule | null = null;
  private services: RemoteXPCServices | null = null;
  private useUsbMuxPath = false;
  private sessionFallbackLogged = false;
  private lastImportError: Error | null = null;

  constructor(
    readonly udid: string,
    private readonly platformVersion: string | undefined,
    private readonly log: AppiumLogger,
    private readonly isRealDevice: boolean,
  ) {}

  get eligible(): boolean {
    return this.isRealDevice && isIos18OrNewerPlatform(this.platformVersion);
  }

  /**
   * Tries to fetch the RemoteXPC Services facade.
   */
  static async tryGetServicesFacade(
    platformVersion: string | null | undefined,
    log: AppiumLogger,
  ): Promise<RemoteXPCServices | null> {
    if (!isIos18OrNewerPlatform(platformVersion)) {
      return null;
    }
    const mod = await tryLoadRemoteXPCModule();
    if (!mod) {
      const importErr = getLastRemoteXPCImportError();
      if (importErr) {
        log.debug(`appium-ios-remotexpc import failed: ${importErr.message}`);
      }
      return null;
    }
    return mod.Services;
  }

  /**
   * Whether remotexpc should be used for service operations in this session.
   */
  async determineAvailability(): Promise<boolean> {
    await this.ensureInitialized();
    return this.enabled;
  }

  /**
   * Loaded remotexpc Services export when {@link determineAvailability} is true.
   */
  async getServices(): Promise<RemoteXPCServices> {
    await this.ensureInitialized();
    if (!this.enabled || !this.services) {
      throw new Error(`RemoteXPC is not available for device '${this.udid}' in this session`);
    }
    return this.services;
  }

  async tryGetServices(): Promise<RemoteXPCServices | null> {
    if (!(await this.determineAvailability())) {
      return null;
    }
    return this.services;
  }

  /**
   * XCTestRunner class from the loaded module.
   */
  async getXCTestRunner(): Promise<RemoteXPCTestRunner> {
    return (await this.requireModule()).XCTestRunner;
  }

  /**
   * XCTestAttachment class from the loaded module.
   */
  async getXCTestAttachment(): Promise<RemoteXPCTestAttachment> {
    return (await this.requireModule()).XCTestAttachment;
  }

  /**
   * Resolves which RemoteXPC lockdown connector to use for this device.
   *
   * @throws When RemoteXPC lockdown cannot be used
   */
  async resolveLockdownStrategy(): Promise<'remotexpc-usbmux' | 'remotexpc-tunnel'> {
    if (!this.eligible) {
      throw new RemoteXPCUnavailableError();
    }

    try {
      await this.requireModule();
    } catch {
      throw new RemoteXPCUnavailableError();
    }

    if (this.useUsbMuxPath) {
      return 'remotexpc-usbmux';
    }

    return 'remotexpc-tunnel';
  }

  /**
   * Creates a RemoteXPC device port forwarder when eligible and available.
   *
   * @throws When RemoteXPC port forwarding cannot be used
   */
  async createDevicePortForwarder(
    localPort: number,
    devicePort: number,
  ): Promise<DevicePortForwarder> {
    if (!this.eligible) {
      throw new RemoteXPCUnavailableError();
    }

    let mod: RemoteXPCEsmModule;
    try {
      mod = await this.requireModule();
    } catch {
      throw new RemoteXPCUnavailableError();
    }

    if (this.useUsbMuxPath) {
      this.log.debug(`Using appium-ios-remotexpc usbmux strategy for '${this.udid}'`);
      return new mod.DevicePortForwarder(localPort, devicePort, {
        primaryConnector: () => mod.connectViaUsbmux(this.udid, devicePort),
      });
    }

    if (!(await this.determineAvailability())) {
      throw wrapRemoteXPCConnectionError(
        new Error('RemoteXPC tunnel is not available for this session'),
        `Cannot create port forwarder via RemoteXPC tunnel for '${this.udid}'`,
      );
    }

    this.log.debug(`Using appium-ios-remotexpc tunnel strategy for '${this.udid}'`);
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
   * Runs a RemoteXPC service operation when the session allows it.
   *
   * Tunnel availability failures during an operation are logged and return `null` without
   * disabling remotexpc for the session (unlike the one-time init probe).
   * Other failures are logged per call and also return `null` so callers can fall back once.
   */
  async attemptService<T>(
    feature: string,
    operation: (services: RemoteXPCServices) => Promise<T>,
  ): Promise<T | null> {
    if (!(await this.determineAvailability())) {
      return null;
    }
    try {
      return await operation(await this.getServices());
    } catch (err) {
      this.handleServiceError(feature, err, 'log');
      return null;
    }
  }

  /**
   * Runs a RemoteXPC service operation when the session allows it.
   *
   * @throws When remotexpc is disabled for the session or the operation fails.
   */
  async requireService<T>(
    feature: string,
    operation: (services: RemoteXPCServices) => Promise<T>,
  ): Promise<T> {
    if (!(await this.determineAvailability())) {
      throw wrapRemoteXPCConnectionError(
        this.lastImportError ?? new Error('RemoteXPC is not available for this session'),
        `Failed ${feature} via RemoteXPC for '${this.udid}'`,
      );
    }
    try {
      return await operation(await this.getServices());
    } catch (err) {
      this.handleServiceError(feature, err, 'throw');
      throw wrapRemoteXPCConnectionError(err, `Failed ${feature} via RemoteXPC for '${this.udid}'`);
    }
  }

  /**
   * Disable remotexpc for the remainder of this session after the initial tunnel registry probe fails.
   */
  noteTunnelUnavailable(feature: string, err: unknown): void {
    if (!isTunnelAvailabilityError(err)) {
      return;
    }
    this.enabled = false;
    this.services = null;
    if (!this.sessionFallbackLogged) {
      this.log.warn(formatRemoteXPCFallbackLog(feature, err));
      this.sessionFallbackLogged = true;
    } else {
      this.log.debug(`RemoteXPC ${feature} skipped: tunnel unavailable for this session`);
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
    this.initialized = true;
  }

  private async initialize(): Promise<void> {
    if (!this.eligible) {
      return;
    }

    const loadedModule = await tryLoadRemoteXPCModule();
    if (!loadedModule) {
      const err = getLastRemoteXPCImportError();
      this.lastImportError = err;
      this.log.warn(
        `appium-ios-remotexpc unavailable for '${this.udid}': ${err?.message ?? 'unknown'}. ` +
          `Using appium-ios-device for this session.`,
      );
      return;
    }

    this.module = loadedModule;
    this.useUsbMuxPath = await isDeviceListedInUsbmux(loadedModule, this.udid, this.log);

    try {
      await loadedModule.Services.getTunnelForDevice(this.udid, {
        waitMs: TUNNEL_REGISTRY_PORT_PROBE_TIMEOUT_MS,
      });
      this.services = loadedModule.Services;
      this.enabled = true;
      this.log.debug(`RemoteXPC enabled for '${this.udid}' (tunnel registry reachable)`);
    } catch (err) {
      this.noteTunnelUnavailable('session initialization', err);
    }
  }

  private async requireModule(): Promise<RemoteXPCEsmModule> {
    await this.ensureInitialized();
    if (!this.module) {
      throw wrapRemoteXPCConnectionError(
        this.lastImportError ?? new Error('appium-ios-remotexpc is not available'),
        `RemoteXPC module is not available for '${this.udid}'`,
      );
    }
    return this.module;
  }

  private handleServiceError(
    feature: string,
    err: unknown,
    onNonTunnelFailure: 'log' | 'throw',
  ): void {
    const message = formatRemoteXPCFallbackLog(feature, err);
    if (isTunnelAvailabilityError(err)) {
      if (onNonTunnelFailure === 'log') {
        this.log.warn(message);
      }
      return;
    }
    if (onNonTunnelFailure === 'log') {
      this.log.error(message);
    }
  }
}
