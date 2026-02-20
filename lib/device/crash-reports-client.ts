import {getRemoteXPCServices} from './remotexpc-utils';
import type {
  CrashReportsService as RemoteXPCCrashReportsService,
  RemoteXpcConnection,
} from 'appium-ios-remotexpc';
import type {Pyidevice as PyideviceClient} from './clients/py-ios-device-client';
import {Pyidevice} from './clients/py-ios-device-client';
import type {AppiumLogger} from '@appium/types';

const CRASH_REPORT_EXTENSIONS = ['.ips'];
const MAX_FILES_IN_ERROR = 10;

/**
 * Unified Crash Reports Client
 *
 * Provides a unified interface for crash report operations on iOS devices,
 * automatically handling the differences between iOS < 18 (py-ios-device via Pyidevice)
 * and iOS 18+ (appium-ios-remotexpc).
 */
export class CrashReportsClient {
  private readonly service: RemoteXPCCrashReportsService | PyideviceClient;
  private readonly remoteXPCConnection?: RemoteXpcConnection;
  private readonly log: AppiumLogger;

  private constructor(
    service: RemoteXPCCrashReportsService | PyideviceClient,
    log: AppiumLogger,
    remoteXPCConnection?: RemoteXpcConnection,
  ) {
    this.service = service;
    this.remoteXPCConnection = remoteXPCConnection;
    this.log = log;
  }

  //#region Public Static Methods

  /**
   * Create a crash reports client for device
   *
   * @param udid - Device UDID
   * @param useRemoteXPC - Whether to use remotexpc
   * @returns CrashReportsClient instance
   */
  static async create(
    udid: string,
    useRemoteXPC: boolean,
    log: AppiumLogger,
  ): Promise<CrashReportsClient> {
    if (useRemoteXPC) {
      const client = await CrashReportsClient.withRemoteXpcConnection(async () => {
        const Services = await getRemoteXPCServices();
        const {crashReportsService, remoteXPC} = await Services.startCrashReportsService(udid);
        return {
          service: crashReportsService,
          connection: remoteXPC,
        };
      }, log);
      if (client) {
        return client;
      }
    }

    // Fallback to Pyidevice
    const pyideviceClient = new Pyidevice({udid, log});
    return new CrashReportsClient(pyideviceClient, log);
  }

  //#endregion

  //#region Public Instance Methods

  /**
   * Check if the crash reports tool exists
   *
   * @param isStrict - If true, throws an error when tool is not found
   * @returns True if the tool exists, false otherwise
   */
  async assertExists(isStrict: boolean = true): Promise<boolean> {
    if (this.isRemoteXPC) {
      // RemoteXPC is already connected, so it exists
      return true;
    }

    // Pyidevice: check if binary exists
    return await this.pyideviceClient.assertExists(isStrict);
  }

  /**
   * List crash report files on the device
   *
   * @returns Array of crash report file names (e.g., ['crash1.ips', 'crash2.crash'])
   */
  async listCrashes(): Promise<string[]> {
    if (!this.isRemoteXPC) {
      return await this.pyideviceClient.listCrashes();
    }

    // RemoteXPC: ls returns full paths, filter and extract filenames
    const allFiles = await this.remoteXPCCrashReportsService.ls('/', -1);
    return allFiles
      .filter((filePath) => CRASH_REPORT_EXTENSIONS.some((ext) => filePath.endsWith(ext)))
      .map((filePath) => {
        const parts = filePath.split('/');
        return parts[parts.length - 1];
      });
  }

  /**
   * Export a crash report file from the device to local directory
   *
   * @param name - Name of the crash report file (e.g., 'crash.ips')
   * @param dstFolder - Local destination folder path
   */
  async exportCrash(name: string, dstFolder: string): Promise<void> {
    if (!this.isRemoteXPC) {
      return await this.pyideviceClient.exportCrash(name, dstFolder);
    }

    // RemoteXPC: need to find full path first, then pull
    const allFiles = await this.remoteXPCCrashReportsService.ls('/', -1);
    const fullPath = allFiles.find((p) => p.endsWith(`/${name}`) || p === `/${name}`);

    if (!fullPath) {
      const filesList = allFiles.slice(0, MAX_FILES_IN_ERROR).join(', ');
      const hasMore = allFiles.length > MAX_FILES_IN_ERROR;
      throw new Error(
        `Crash report '${name}' not found on device. ` +
          `Available files: ${filesList}${hasMore ? `, ... and ${allFiles.length - MAX_FILES_IN_ERROR} more` : ''}`,
      );
    }

    await this.remoteXPCCrashReportsService.pull(dstFolder, fullPath);
  }

  /**
   * Close the crash reports service and release resources
   *
   * Only RemoteXPC clients need explicit cleanup; Pyidevice is stateless
   */
  async close(): Promise<void> {
    if (!this.isRemoteXPC) {
      return;
    }

    this.remoteXPCCrashReportsService.close();

    if (this.remoteXPCConnection) {
      try {
        await this.remoteXPCConnection.close();
      } catch (err) {
        this.log.warn(
          `Error closing RemoteXPC connection for crash reports: ${(err as Error).message}`,
        );
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
   * Helper to safely execute remoteXPC operations with connection cleanup
   * @param operation - Async operation that returns service and connection
   * @returns CrashReportsClient on success, null on failure
   */
  private static async withRemoteXpcConnection(
    operation: () => Promise<{
      service: RemoteXPCCrashReportsService;
      connection: RemoteXpcConnection;
    }>,
    log: AppiumLogger,
  ): Promise<CrashReportsClient | null> {
    let remoteXPCConnection: RemoteXpcConnection | undefined;
    let succeeded = false;
    try {
      const {service, connection} = await operation();
      remoteXPCConnection = connection;
      const client = new CrashReportsClient(service, log, remoteXPCConnection);
      succeeded = true;
      return client;
    } catch (err: any) {
      log.error(
        `Failed to create crash reports client via RemoteXPC: ${err.message}. ` +
          `Falling back to py-ios-device (pyidevice)`,
      );
      return null;
    } finally {
      // Only close connection if we failed (if succeeded, the client owns it)
      if (remoteXPCConnection && !succeeded) {
        try {
          await remoteXPCConnection.close();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Get service as RemoteXPC crash reports service
   */
  private get remoteXPCCrashReportsService(): RemoteXPCCrashReportsService {
    return this.service as RemoteXPCCrashReportsService;
  }

  /**
   * Get service as Pyidevice client
   */
  private get pyideviceClient(): PyideviceClient {
    return this.service as PyideviceClient;
  }

  //#endregion
}
