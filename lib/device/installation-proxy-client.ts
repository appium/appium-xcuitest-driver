import type {AppiumLogger} from '@appium/types';
import type {InstallationProxyService as RemoteXPCInstallationProxyService} from 'appium-ios-remotexpc';

import {log} from '../logger.js';
import type {AppInfo, AppInfoMapping} from '../types.js';
import type {RemoteXPCFacade} from './remote-xpc/index.js';

/**
 * Progress response structure for installation/uninstallation operations
 */
interface ProgressResponse {
  PercentComplete?: number;
  Status?: string;
  Error?: string;
  ErrorDescription?: string;
}

type InstallationProxyProgressOperation = 'install' | 'upgrade' | 'uninstall';

/**
 * Options for listing applications
 */
interface ListApplicationOptions {
  applicationType?: 'User' | 'System';
  returnAttributes?: string[];
}

/**
 * Options for lookup applications
 */
interface LookupApplicationOptions {
  bundleIds: string | string[];
  returnAttributes?: string[];
  applicationType?: 'User' | 'System';
}

interface CreateInstallationProxyOptions {
  facade: RemoteXPCFacade;
  logger?: AppiumLogger;
}

/**
 * Installation Proxy Client
 *
 * Provides app installation/management operations on iOS devices on top of appium-ios-remotexpc
 */
export class InstallationProxyClient {
  private _lastLoggedProgress?: {percent?: number; status?: string};

  private constructor(
    private readonly service: RemoteXPCInstallationProxyService,
    private readonly _log: AppiumLogger = log,
  ) {}

  //#region Public Methods

  /**
   * Create an InstallationProxy client for the device
   *
   * @param udid - Device UDID
   * @param opts - Creation options
   * @returns InstallationProxy client instance
   */
  static async create(udid: string, opts: CreateInstallationProxyOptions): Promise<InstallationProxyClient> {
    const {facade, logger} = opts;
    const service = await facade.requireService('InstallationProxy', (Services, options) =>
      Services.startInstallationProxyService(udid, options),
    );
    return new InstallationProxyClient(service, logger);
  }

  /**
   * List installed applications
   *
   * @param opts - Options for filtering and selecting attributes
   * @returns Object keyed by bundle ID
   */
  async listApplications(opts?: ListApplicationOptions): Promise<AppInfoMapping> {
    let normalizedOpts = opts;

    // Ensure CFBundleIdentifier is always included
    if (opts?.returnAttributes && !opts.returnAttributes.includes('CFBundleIdentifier')) {
      normalizedOpts = {
        ...opts,
        returnAttributes: ['CFBundleIdentifier', ...opts.returnAttributes],
      };
    }

    // The service returns an array, need to convert to object
    const apps = await this.service.browse({
      applicationType: normalizedOpts?.applicationType || 'Any',
      // Use '*' to request all attributes when returnAttributes is not explicitly specified
      returnAttributes: normalizedOpts?.returnAttributes || '*',
    });

    // Convert array to object keyed by CFBundleIdentifier
    return apps.reduce((acc, app) => {
      if (app.CFBundleIdentifier) {
        acc[app.CFBundleIdentifier] = app as AppInfo;
      }
      return acc;
    }, {} as AppInfoMapping);
  }

  /**
   * Look up application information for specific bundle IDs
   *
   * @param opts - Bundle IDs and options
   * @returns Object keyed by bundle ID
   */
  async lookupApplications(opts: LookupApplicationOptions): Promise<AppInfoMapping> {
    const bundleIds = Array.isArray(opts.bundleIds) ? opts.bundleIds : [opts.bundleIds];
    return (await this.service.lookup(bundleIds, {
      returnAttributes: opts.returnAttributes,
      applicationType: opts.applicationType,
    })) as AppInfoMapping;
  }

  /**
   * Install an application
   *
   * @param path - Path to ipa
   * @param clientOptions - Installation options
   * @param timeoutMs - Timeout in milliseconds
   */
  async installApplication(path: string, clientOptions?: Record<string, any>, timeoutMs?: number): Promise<void> {
    await this.executeWithProgressLogging('install', (progressHandler) =>
      this.service.install(path, {...clientOptions, timeoutMs}, progressHandler),
    );
  }

  /**
   * Upgrade an application
   *
   * @param path - Path to app on device
   * @param clientOptions - Installation options
   * @param timeoutMs - Timeout in milliseconds
   */
  async upgradeApplication(path: string, clientOptions?: Record<string, any>, timeoutMs?: number): Promise<void> {
    await this.executeWithProgressLogging('upgrade', (progressHandler) =>
      this.service.upgrade(path, {...clientOptions, timeoutMs}, progressHandler),
    );
  }

  /**
   * Uninstall an application
   *
   * @param bundleId - Bundle ID of app to uninstall
   * @param timeoutMs - Timeout in milliseconds
   */
  async uninstallApplication(bundleId: string, timeoutMs?: number): Promise<void> {
    await this.executeWithProgressLogging('uninstall', (progressHandler) =>
      this.service.uninstall(bundleId, {timeoutMs}, progressHandler),
    );
  }

  /**
   * Close the client and cleanup resources
   */
  async close(): Promise<void> {
    try {
      this.service.close();
    } catch (err: any) {
      this._log.debug(`Error closing installation proxy service: ${err.message}`);
    }
  }

  //#endregion

  //#region Private Methods

  /**
   * Execute a RemoteXPC operation and log progress messages as they arrive
   *
   * @param operation - Function that executes the RemoteXPC operation with a progress handler
   */
  private async executeWithProgressLogging(
    progressOperation: InstallationProxyProgressOperation,
    operation: (progressHandler: (percentComplete: number, status: string) => void) => Promise<void>,
  ): Promise<void> {
    this._lastLoggedProgress = undefined;
    await operation((percentComplete, status) => {
      this.logProgress(progressOperation, {PercentComplete: percentComplete, Status: status});
    });
  }

  private logProgress(progressOperation: InstallationProxyProgressOperation, message: ProgressResponse): void {
    const prefix = `App ${progressOperation} progress`;
    if (message.Error) {
      this._log.warn(
        `${prefix} error: ${message.Error}` + (message.ErrorDescription ? ` (${message.ErrorDescription})` : ''),
      );
      return;
    }

    const {PercentComplete: percentComplete, Status: status} = message;
    if (percentComplete === undefined && !status) {
      return;
    }

    if (percentComplete === this._lastLoggedProgress?.percent && status === this._lastLoggedProgress?.status) {
      return;
    }
    this._lastLoggedProgress = {percent: percentComplete, status};

    if (percentComplete !== undefined) {
      this._log.debug(`${prefix}: ${percentComplete}%${status ? ` (${status})` : ''}`);
    } else if (status) {
      this._log.debug(`${prefix}: ${status}`);
    }
  }

  //#endregion
}
