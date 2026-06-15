import type {AppiumLogger} from '@appium/types';
import type {LockdownService} from 'appium-ios-remotexpc';
import {isIos18OrNewerPlatform} from '../../utils';
import {isDeviceListedInUsbmux} from './usbmux-utils';
import {
  formatRemoteXPCFallbackLog,
  isTunnelAvailabilityError,
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
 * Initialized lazily on the first remotexpc operation. When tunnel registry access fails with
 * {@link isTunnelAvailabilityError}, remotexpc is disabled for the remainder of the session so
 * callers fall back to appium-ios-device without re-probing the tunnel on every service call.
 */
export class RemoteXPCFacade {
  private initPromise: Promise<void> | null = null;
  private initialized = false;
  private enabled = false;
  private module: RemoteXPCEsmModule | null = null;
  private services: RemoteXPCServices | null = null;
  private useUsbMuxPath = false;
  private sessionFallbackLogged = false;
  private cachedXCTestRunner: RemoteXPCTestRunner | null = null;
  private cachedXCTestAttachment: RemoteXPCTestAttachment | null = null;
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
   * Services for pre-session tunnel-registry device listing (no per-device session state).
   */
  static async tryGetRegistryServices(
    platformVersion: string | null | undefined,
    log: AppiumLogger,
  ): Promise<RemoteXPCServices | null> {
    if (!isIos18OrNewerPlatform(platformVersion)) {
      return null;
    }
    const mod = await tryLoadRemoteXPCModule();
    if (!mod) {
      log.warn(
        `appium-ios-remotexpc unavailable for device listing: ${getLastRemoteXPCImportError()?.message ?? 'unknown'}. ` +
          `Using legacy devices listing instead.`,
      );
      return null;
    }
    return mod.Services;
  }

  /**
   * Whether remotexpc should be used for service operations in this session.
   */
  async shouldUseRemoteXPC(): Promise<boolean> {
    await this.ensureInitialized();
    return this.enabled;
  }

  /**
   * Loaded remotexpc Services export when {@link shouldUseRemoteXPC} is true.
   */
  async getServices(): Promise<RemoteXPCServices> {
    await this.ensureInitialized();
    if (!this.enabled || !this.services) {
      throw new Error(`RemoteXPC is not available for device '${this.udid}' in this session`);
    }
    return this.services;
  }

  async tryGetServices(): Promise<RemoteXPCServices | null> {
    if (!(await this.shouldUseRemoteXPC())) {
      return null;
    }
    return this.services;
  }

  /**
   * XCTestRunner class from the loaded module (session-scoped cache).
   */
  async getXCTestRunner(): Promise<RemoteXPCTestRunner> {
    if (this.cachedXCTestRunner) {
      return this.cachedXCTestRunner;
    }
    const mod = await this.requireModule();
    const XCTestRunnerClass = mod.XCTestRunner;
    if (typeof XCTestRunnerClass !== 'function') {
      throw new Error(
        'XCTestRunner is not exported from appium-ios-remotexpc. ' +
          'The installed version may be incompatible.',
      );
    }
    this.cachedXCTestRunner = XCTestRunnerClass;
    return XCTestRunnerClass;
  }

  /**
   * XCTestAttachment class from the loaded module (session-scoped cache).
   */
  async getXCTestAttachment(): Promise<RemoteXPCTestAttachment> {
    if (this.cachedXCTestAttachment) {
      return this.cachedXCTestAttachment;
    }
    const mod = await this.requireModule();
    const XCTestAttachmentClass = mod.XCTestAttachment;
    if (typeof XCTestAttachmentClass !== 'function') {
      throw new Error(
        'XCTestAttachment is not exported from appium-ios-remotexpc. ' +
          'The installed version may be incompatible.',
      );
    }
    this.cachedXCTestAttachment = XCTestAttachmentClass;
    return XCTestAttachmentClass;
  }

  /**
   * Human-readable import/init failure for diagnostics when {@link getUsbMuxStrategy} is null.
   */
  getImportErrorMessage(): string {
    return this.lastImportError?.message ?? 'unknown';
  }

  /**
   * Module plus usbmux listing hint for lockdown and port-forwarding branch selection.
   */
  async getUsbMuxStrategy(): Promise<{
    remotexpc: RemoteXPCEsmModule;
    useUsbMuxPath: boolean;
  } | null> {
    await this.ensureInitialized();
    if (!this.module) {
      return null;
    }
    return {remotexpc: this.module, useUsbMuxPath: this.useUsbMuxPath};
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
   * Tunnel availability failures disable remotexpc for the session and return `null`.
   * Other failures are logged per call and also return `null` so callers can fall back once.
   */
  async attemptService<T>(
    feature: string,
    operation: (services: RemoteXPCServices) => Promise<T>,
  ): Promise<T | null> {
    if (!(await this.shouldUseRemoteXPC())) {
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
    if (!(await this.shouldUseRemoteXPC())) {
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
   * Disable remotexpc for the remainder of this session after a tunnel registry failure.
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
    if (isTunnelAvailabilityError(err)) {
      this.noteTunnelUnavailable(feature, err);
      return;
    }
    if (onNonTunnelFailure === 'log') {
      this.log.error(formatRemoteXPCFallbackLog(feature, err));
    }
  }
}
