import {getRemoteXPCServices} from './remotexpc-utils';
import {log} from '../logger';
import {services} from 'appium-ios-device';
import type {InstallationProxyService as IOSDeviceInstallationProxyService} from 'appium-ios-device';
import type {
  InstallationProxyService as RemoteXPCInstallationProxyService,
  RemoteXpcConnection,
} from 'appium-ios-remotexpc';
import type {AppInfo, AppInfoMapping} from '../types';

/**
 * Progress response structure for installation/uninstallation operations
 */
interface ProgressResponse {
  PercentComplete?: number;
  Status?: string;
  Error?: string;
  ErrorDescription?: string;
}

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

/**
 * Unified Installation Proxy Client
 *
 * Provides a unified interface for app installation/management operations on iOS devices
 */
export class InstallationProxyClient {
  private constructor(
    private readonly service: RemoteXPCInstallationProxyService | IOSDeviceInstallationProxyService,
    private readonly remoteXPCConnection?: RemoteXpcConnection,
  ) {}

  //#region Public Methods

  /**
   * Create an InstallationProxy client for the device
   *
   * @param udid - Device UDID
   * @param useRemoteXPC - Whether to use RemoteXPC
   * @returns InstallationProxy client instance
   */
  static async create(udid: string, useRemoteXPC: boolean): Promise<InstallationProxyClient> {
    if (useRemoteXPC) {
      const client = await InstallationProxyClient.withRemoteXpcConnection(async () => {
        const Services = await getRemoteXPCServices();
        const {installationProxyService, remoteXPC} =
          await Services.startInstallationProxyService(udid);
        return {
          service: installationProxyService,
          connection: remoteXPC,
        };
      });
      if (client) {
        return client;
      }
    }

    const service = await services.startInstallationProxyService(udid);
    return new InstallationProxyClient(service);
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

    if (!this.isRemoteXPC) {
      return await this.iosDeviceService.listApplications(normalizedOpts);
    }

    // RemoteXPC returns array, need to convert to object
    const apps = await this.remoteXPCService.browse({
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
    if (!this.isRemoteXPC) {
      return await this.iosDeviceService.lookupApplications(opts);
    }

    const bundleIds = Array.isArray(opts.bundleIds) ? opts.bundleIds : [opts.bundleIds];
    return (await this.remoteXPCService.lookup(bundleIds, {
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
   * @returns Array of progress messages received during installation
   */
  async installApplication(
    path: string,
    clientOptions?: Record<string, any>,
    timeoutMs?: number,
  ): Promise<ProgressResponse[]> {
    if (!this.isRemoteXPC) {
      return await this.iosDeviceService.installApplication(path, clientOptions, timeoutMs);
    }

    return await this.executeWithProgressCollection((progressHandler) =>
      this.remoteXPCService.install(path, {...clientOptions, timeoutMs}, progressHandler),
    );
  }

  /**
   * Upgrade an application
   *
   * @param path - Path to app on device
   * @param clientOptions - Installation options
   * @param timeoutMs - Timeout in milliseconds
   * @returns Array of progress messages received during upgrade
   */
  async upgradeApplication(
    path: string,
    clientOptions?: Record<string, any>,
    timeoutMs?: number,
  ): Promise<ProgressResponse[]> {
    if (!this.isRemoteXPC) {
      return await this.iosDeviceService.upgradeApplication(path, clientOptions, timeoutMs);
    }

    return await this.executeWithProgressCollection((progressHandler) =>
      this.remoteXPCService.upgrade(path, {...clientOptions, timeoutMs}, progressHandler),
    );
  }

  /**
   * Uninstall an application
   *
   * @param bundleId - Bundle ID of app to uninstall
   * @param timeoutMs - Timeout in milliseconds
   * @returns Array of progress messages received during uninstallation
   */
  async uninstallApplication(bundleId: string, timeoutMs?: number): Promise<ProgressResponse[]> {
    if (!this.isRemoteXPC) {
      return await this.iosDeviceService.uninstallApplication(bundleId, timeoutMs);
    }

    return await this.executeWithProgressCollection((progressHandler) =>
      this.remoteXPCService.uninstall(bundleId, {timeoutMs}, progressHandler),
    );
  }

  /**
   * Close the client and cleanup resources
   */
  async close(): Promise<void> {
    try {
      this.service.close();
    } catch (err: any) {
      log.debug(`Error closing installation proxy service: ${err.message}`);
    }

    if (this.remoteXPCConnection) {
      try {
        await this.remoteXPCConnection.close();
      } catch (err: any) {
        log.warn(`Error closing RemoteXPC connection: ${err.message}`);
      }
    }
  }

  //#endregion

  //#region Private Methods

  /**
   * Check if this client is using RemoteXPC
   */
  private get isRemoteXPC(): boolean {
    return !!this.remoteXPCConnection;
  }

  /**
   * Get the RemoteXPC service (throws if not RemoteXPC)
   */
  private get remoteXPCService(): RemoteXPCInstallationProxyService {
    return this.service as RemoteXPCInstallationProxyService;
  }

  /**
   * Get the ios-device service (throws if not ios-device)
   */
  private get iosDeviceService(): IOSDeviceInstallationProxyService {
    return this.service as IOSDeviceInstallationProxyService;
  }

  /**
   * Execute a RemoteXPC operation and collect progress messages to match ios-device behavior
   *
   * @param operation - Function that executes the RemoteXPC operation with a progress handler
   * @returns Array of progress messages
   */
  private async executeWithProgressCollection(
    operation: (
      progressHandler: (percentComplete: number, status: string) => void,
    ) => Promise<void>,
  ): Promise<ProgressResponse[]> {
    const messages: ProgressResponse[] = [];
    await operation((percentComplete, status) => {
      messages.push({PercentComplete: percentComplete, Status: status});
    });
    return messages;
  }

  /**
   * Helper to safely execute RemoteXPC operations with connection cleanup
   */
  private static async withRemoteXpcConnection<
    T extends RemoteXPCInstallationProxyService | IOSDeviceInstallationProxyService,
  >(
    operation: () => Promise<{service: T; connection: RemoteXpcConnection}>,
  ): Promise<InstallationProxyClient | null> {
    let remoteXPCConnection: RemoteXpcConnection | undefined;
    let succeeded = false;
    try {
      const {service, connection} = await operation();
      remoteXPCConnection = connection;
      const client = new InstallationProxyClient(service, remoteXPCConnection);
      succeeded = true;
      return client;
    } catch (err: any) {
      log.error(
        `Failed to create InstallationProxy client via RemoteXPC: ${err.message}, falling back to appium-ios-device`,
      );
      return null;
    } finally {
      // Only close connection if we failed (if succeeded, the client owns it)
      if (!succeeded && remoteXPCConnection) {
        try {
          await remoteXPCConnection.close();
        } catch (closeErr: any) {
          log.debug(`Error closing RemoteXPC connection during cleanup: ${closeErr.message}`);
        }
      }
    }
  }

  //#endregion
}
