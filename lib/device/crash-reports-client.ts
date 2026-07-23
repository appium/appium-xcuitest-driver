import type {CrashReportsService as RemoteXPCCrashReportsService} from 'appium-ios-remotexpc';

import {log} from '../logger.js';
import type {RemoteXPCFacade} from './remote-xpc/index.js';

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

  private constructor(crashReportsService: RemoteXPCCrashReportsService) {
    this.crashReportsService = crashReportsService;
  }

  /**
   * Opens a RemoteXPC crash-reports service for the given UDID.
   *
   * @param udid - Real device UDID
   * @param facade - Per-session RemoteXPC facade
   * @throws {Error} If RemoteXPC is disabled for the session or setup fails
   */
  static async create(udid: string, facade: RemoteXPCFacade | null): Promise<CrashReportsClient> {
    if (!facade) {
      throw new Error(
        'Real device crash report access requires iOS/tvOS 18 or newer with the appium-ios-remotexpc ' +
          'package installed.',
      );
    }

    const crashReportsService = await facade.requireService('crash reports', (Services) =>
      Services.startCrashReportsService(udid),
    );
    return new CrashReportsClient(crashReportsService);
  }

  /**
   * @returns Basenames of crash report files on the device (e.g. `MyApp-2024-01-01-120000.ips`)
   */
  async listCrashes(): Promise<string[]> {
    const allFiles = await this._listCrashReportPaths();
    return allFiles.map((filePath) => {
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
    const allFiles = await this._listCrashReportPaths();
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
   * Tears down the crash-reports service.
   */
  async close(): Promise<void> {
    try {
      this.crashReportsService.close();
    } catch (err) {
      log.warn(`Error closing crash reports service: ${(err as Error).message}`);
    }
  }

  /**
   * Walk the crash-reports tree and collect `.ips` paths without listing the full tree upfront.
   */
  private async _listCrashReportPaths(): Promise<string[]> {
    const results: string[] = [];
    await this._collectCrashReportPaths('/', results);
    return results;
  }

  private async _collectCrashReportPaths(dirPath: string, results: string[]): Promise<void> {
    let children: string[];
    try {
      children = await this.crashReportsService.ls(dirPath, 1);
    } catch {
      return;
    }

    for (const entryPath of children) {
      const basename = entryPath.split('/').pop() ?? entryPath;
      if (CRASH_REPORT_EXTENSIONS.some((ext) => basename.endsWith(ext))) {
        results.push(entryPath);
        continue;
      }

      try {
        await this._collectCrashReportPaths(entryPath, results);
      } catch {
        // Skip entries we can't access or that aren't directories
      }
    }
  }
}
