import {getRemoteXPCServices} from './remotexpc-utils';
import {log} from '../logger';
import {services} from 'appium-ios-device';
import type {InstallationProxyService as IOSDeviceInstallationProxyService} from 'appium-ios-device';
import type {
  InstallationProxyService as RemoteXPCInstallationProxyService,
  RemoteXpcConnection,
} from 'appium-ios-remotexpc';

/**
 * Application information interface
 */
interface AppInfo {
  CFBundleIdentifier?: string;
  CFBundleName?: string;
  CFBundleDisplayName?: string;
  CFBundleVersion?: string;
  CFBundleShortVersionString?: string;
  ApplicationType?: string;
  Path?: string;
  Container?: string;
  StaticDiskUsage?: number;
  DynamicDiskUsage?: number;
  [key: string]: any;
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
    private readonly remoteXPCConnection?: RemoteXpcConnection
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
        const {installationProxyService, remoteXPC} = await Services.startInstallationProxyService(udid);
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
  async listApplications(opts?: ListApplicationOptions): Promise<Record<string, AppInfo>> {
    if (this.isRemoteXPC) {
      // RemoteXPC returns array, need to convert to object
      const apps = await this.remoteXPCService.browse({
        applicationType: opts?.applicationType || 'Any',
        returnAttributes: opts?.returnAttributes,
      });

      // Convert array to object keyed by CFBundleIdentifier
      return apps.reduce((acc, app) => {
        if (app.CFBundleIdentifier) {
          acc[app.CFBundleIdentifier] = app;
        }
        return acc;
      }, {} as Record<string, AppInfo>);
    }

    // ios-device already returns object
    return await this.iosDeviceService.listApplications(opts);
  }

  /**
   * Look up application information for specific bundle IDs
   *
   * @param opts - Bundle IDs and options
   * @returns Object keyed by bundle ID
   */
  async lookupApplications(opts: LookupApplicationOptions): Promise<Record<string, AppInfo>> {
    const bundleIds = Array.isArray(opts.bundleIds) ? opts.bundleIds : [opts.bundleIds];

    if (this.isRemoteXPC) {
      return await this.remoteXPCService.lookup(bundleIds, {
        returnAttributes: opts.returnAttributes,
        applicationType: opts.applicationType,
      });
    }

    return await this.iosDeviceService.lookupApplications(opts);
  }

  /**
   * Install an application
   *
   * @param path - Path to ipa
   * @param clientOptions - Installation options
   * @param timeout - Timeout in milliseconds (only applies to ios-device, RemoteXPC has built-in 10-minute timeout)
   * @returns Array of progress messages received during installation
   */
  async installApplication(
    path: string,
    clientOptions?: Record<string, any>,
    timeout?: number
  ): Promise<any[]> {
    if (this.isRemoteXPC) {
      return await this.executeWithProgressCollection(
        (progressHandler) => this.remoteXPCService.install(path, clientOptions, progressHandler)
      );
    }

    return await this.iosDeviceService.installApplication(path, clientOptions, timeout);
  }

  /**
   * Upgrade an application
   *
   * @param path - Path to app on device
   * @param clientOptions - Installation options
   * @param timeout - Timeout in milliseconds (only applies to ios-device, RemoteXPC has built-in 10-minute timeout)
   * @returns Array of progress messages received during upgrade
   */
  async upgradeApplication(
    path: string,
    clientOptions?: Record<string, any>,
    timeout?: number
  ): Promise<any[]> {
    if (this.isRemoteXPC) {
      return await this.executeWithProgressCollection(
        (progressHandler) => this.remoteXPCService.upgrade(path, clientOptions, progressHandler)
      );
    }

    return await this.iosDeviceService.upgradeApplication(path, clientOptions, timeout);
  }

  /**
   * Uninstall an application
   *
   * @param bundleId - Bundle ID of app to uninstall
   * @param timeout - Timeout in milliseconds (only applies to ios-device, RemoteXPC has built-in 10-minute timeout)
   * @returns Array of progress messages received during uninstallation
   */
  async uninstallApplication(bundleId: string, timeout?: number): Promise<any[]> {
    if (this.isRemoteXPC) {
      return await this.executeWithProgressCollection(
        (progressHandler) => this.remoteXPCService.uninstall(bundleId, {}, progressHandler)
      );
    }

    return await this.iosDeviceService.uninstallApplication(bundleId, timeout);
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
    operation: (progressHandler: (percentComplete: number, status: string) => void) => Promise<void>
  ): Promise<any[]> {
    const messages: any[] = [];
    await operation((percentComplete, status) => {
      messages.push({PercentComplete: percentComplete, Status: status});
    });
    return messages;
  }

  /**
   * Helper to safely execute RemoteXPC operations with connection cleanup
   */
  private static async withRemoteXpcConnection<T extends RemoteXPCInstallationProxyService | IOSDeviceInstallationProxyService>(
    operation: () => Promise<{service: T; connection: RemoteXpcConnection}>
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
      log.error(`Failed to create InstallationProxy client via RemoteXPC: ${err.message}, falling back to appium-ios-device`);
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
