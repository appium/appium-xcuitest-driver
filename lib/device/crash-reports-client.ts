import {getRemoteXPCServices} from './remotexpc-utils';
import {log} from '../logger';
import type {
  CrashReportsService as RemoteXPCCrashReportsService,
  RemoteXpcConnection,
} from 'appium-ios-remotexpc';

const CRASH_REPORT_EXTENSIONS = ['.ips'];
const MAX_FILES_IN_ERROR = 10;

/**
 * Lists and exports device crash reports (`.ips`) on real hardware over RemoteXPC.
 *
 * Requires **iOS/tvOS 18+** and the optional **`appium-ios-remotexpc`** package.
 * Used by {@link IOSCrashLog} for BiDi / `crashlog` collection on real devices.
 */
export class CrashReportsClient {
  private readonly crashReportsService: RemoteXPCCrashReportsService;
  private readonly remoteXPCConnection: RemoteXpcConnection;

  private constructor(
    crashReportsService: RemoteXPCCrashReportsService,
    remoteXPCConnection: RemoteXpcConnection,
  ) {
    this.crashReportsService = crashReportsService;
    this.remoteXPCConnection = remoteXPCConnection;
  }

  /**
   * Opens a RemoteXPC crash-reports service for the given UDID.
   *
   * @param udid - Real device UDID
   * @param useRemoteXPC - Must be `true`; callers derive this from `isIos18OrNewer` / session options
   * @throws {Error} If `useRemoteXPC` is false, or RemoteXPC setup fails
   */
  static async create(udid: string, useRemoteXPC: boolean): Promise<CrashReportsClient> {
    if (!useRemoteXPC) {
      throw new Error(
        'Real device crash report access requires iOS/tvOS 18 or newer with the appium-ios-remotexpc ' +
          'package installed.',
      );
    }

    let remoteXPCConnection: RemoteXpcConnection | undefined;
    let succeeded = false;
    try {
      const Services = await getRemoteXPCServices();
      const {crashReportsService, remoteXPC} = await Services.startCrashReportsService(udid);
      remoteXPCConnection = remoteXPC;
      const client = new CrashReportsClient(crashReportsService, remoteXPCConnection);
      succeeded = true;
      return client;
    } catch (err: any) {
      throw new Error(
        `Failed to create crash reports client via RemoteXPC: ${err.message}. ` +
          'Ensure appium-ios-remotexpc is installed and the device is supported.',
      );
    } finally {
      if (remoteXPCConnection && !succeeded) {
        try {
          await remoteXPCConnection.close();
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * @returns Basenames of crash report files on the device (e.g. `MyApp-2024-01-01-120000.ips`)
   */
  async listCrashes(): Promise<string[]> {
    const allFiles = await this.crashReportsService.ls('/', -1);
    return allFiles
      .filter((filePath) => CRASH_REPORT_EXTENSIONS.some((ext) => filePath.endsWith(ext)))
      .map((filePath) => {
        const parts = filePath.split('/');
        return parts[parts.length - 1];
      });
  }

  /**
   * Pulls a single crash report off the device into a local folder.
   *
   * @param name - Crash file basename as returned by {@link CrashReportsClient.listCrashes}
   * @param dstFolder - Existing local directory to write into
   * @throws {Error} If the named report is not found on the device
   */
  async exportCrash(name: string, dstFolder: string): Promise<void> {
    const allFiles = await this.crashReportsService.ls('/', -1);
    const fullPath = allFiles.find((p) => p.endsWith(`/${name}`) || p === `/${name}`);

    if (!fullPath) {
      const filesList = allFiles.slice(0, MAX_FILES_IN_ERROR).join(', ');
      const hasMore = allFiles.length > MAX_FILES_IN_ERROR;
      throw new Error(
        `Crash report '${name}' not found on device. ` +
          `Available files: ${filesList}${hasMore ? `, ... and ${allFiles.length - MAX_FILES_IN_ERROR} more` : ''}`,
      );
    }

    await this.crashReportsService.pull(dstFolder, fullPath);
  }

  /**
   * Tears down the crash-reports service and closes the RemoteXPC connection.
   */
  async close(): Promise<void> {
    this.crashReportsService.close();

    try {
      await this.remoteXPCConnection.close();
    } catch (err) {
      log.warn(`Error closing RemoteXPC connection for crash reports: ${(err as Error).message}`);
    }
  }
}
