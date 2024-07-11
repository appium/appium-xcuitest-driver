import {fs, tempDir, util} from 'appium/support';
import B from 'bluebird';
import path from 'path';
import _ from 'lodash';
import {Pyidevice} from '../real-device-clients/py-ios-device-client';
import IOSLog from './ios-log';
import { toLogEntry, grepFile } from './helpers';
import type { AppiumLogger } from '@appium/types';
import type { BaseDeviceClient } from '../real-device-clients/base-device-client';
import type { Simulator } from 'appium-ios-simulator';
import type { LogEntry } from '../commands/types';

// The file format has been changed from '.crash' to '.ips' since Monterey.
const CRASH_REPORTS_GLOB_PATTERN = '**/*.@(crash|ips)';
// The size of a single diagnostic report might be hundreds of kilobytes.
// Thus we do not want to store too many items in the memory at once.
const MAX_RECENT_ITEMS = 20;

type TSerializedEntry = [string, number];

export interface IOSCrashLogOptions {
  /** UDID of a real device */
  udid?: string;
  /** Simulator instance */
  sim?: Simulator;
  log: AppiumLogger;
}

export class IOSCrashLog extends IOSLog<TSerializedEntry, TSerializedEntry> {
  private readonly _udid: string | undefined;
  private readonly _realDeviceClient: BaseDeviceClient | null;
  private readonly _logDir: string | null;
  private readonly _sim: Simulator | undefined;
  private _recentCrashFiles: string[];
  private _started: boolean;

  constructor(opts: IOSCrashLogOptions) {
    super({
      log: opts.log,
      maxBufferSize: MAX_RECENT_ITEMS,
    });
    this._udid = opts.udid;
    this._sim = opts.sim;
    this._realDeviceClient = this._isRealDevice()
      ? new Pyidevice({
        udid: this._udid as string,
        log: opts.log,
      })
      : null;
    this._logDir = this._isRealDevice()
      ? null
      : path.resolve(process.env.HOME || '/', 'Library', 'Logs', 'DiagnosticReports');
    this._recentCrashFiles = [];
    this._started = false;
  }

  override async startCapture(): Promise<void> {
    this._recentCrashFiles = await this._listCrashFiles(false);
    this._started = true;
  }

  // eslint-disable-next-line require-await
  override async stopCapture(): Promise<void> {
    this._started = false;
  }

  override get isCapturing(): boolean {
    return this._started;
  }

  override async getLogs(): Promise<LogEntry[]> {
    const crashFiles = (await this._listCrashFiles(true)).slice(-MAX_RECENT_ITEMS);
    const diffFiles = _.difference(crashFiles, this._recentCrashFiles);
    if (_.isEmpty(diffFiles)) {
      return [];
    }

    this.log.debug(`Found ${util.pluralize('fresh crash report', diffFiles.length, true)}`);
    await this._serializeCrashes(diffFiles);
    this._recentCrashFiles = crashFiles;
    return super.getLogs();
  }

  protected override _serializeEntry(value: TSerializedEntry): TSerializedEntry {
    return value;
  }

  protected override _deserializeEntry(value: TSerializedEntry): LogEntry {
    const [message, timestamp] = value;
    return toLogEntry(message, timestamp);
  }

  private async _serializeCrashes(paths: string[]): Promise<void> {
    const tmpRoot = await tempDir.openDir();
    try {
      for (const filePath of paths) {
        let fullPath = filePath;
        if (this._isRealDevice()) {
          const fileName = filePath;
          try {
            await (this._realDeviceClient as BaseDeviceClient).exportCrash(fileName, tmpRoot);
          } catch (e) {
            this.log.warn(
              `Cannot export the crash report '${fileName}'. Skipping it. ` +
              `Original error: ${e.message}`,
            );
            return;
          }
          fullPath = path.join(tmpRoot, fileName);
        }
        const {ctime} = await fs.stat(fullPath);
        this.broadcast([await fs.readFile(fullPath, 'utf8'), ctime.getTime()]);
      }
    } finally {
      await fs.rimraf(tmpRoot);
    }
  }

  private async _gatherFromRealDevice(strict: boolean): Promise<string[]> {
    if (!this._realDeviceClient) {
      return [];
    }
    if (!await this._realDeviceClient.assertExists(strict)) {
      this.log.info(
        `The ${_.toLower(this._realDeviceClient.constructor.name)} tool is not present in PATH. ` +
        `Skipping crash logs collection for real devices.`
      );
      return [];
    }

    return await this._realDeviceClient.listCrashes();
  }

  private async _gatherFromSimulator(): Promise<string[]> {
    if (!this._logDir || !this._sim || !(await fs.exists(this._logDir))) {
      this.log.debug(`Crash reports root '${this._logDir}' does not exist. Got nothing to gather.`);
      return [];
    }

    const foundFiles = await fs.glob(CRASH_REPORTS_GLOB_PATTERN, {
      cwd: this._logDir,
      absolute: true,
    });
    const simUdid = (this._sim as Simulator).udid;
    // For Simulator only include files, that contain current UDID
    return await B.filter(foundFiles, async (filePath) => {
      try {
        return await grepFile(filePath, simUdid, {caseInsensitive: true});
      } catch (err) {
        this.log.warn(err);
        return false;
      }
    });
  }

  private async _listCrashFiles(strict: boolean): Promise<string[]> {
    return this._isRealDevice()
      ? await this._gatherFromRealDevice(strict)
      : await this._gatherFromSimulator();
  }

  private _isRealDevice(): boolean {
    return Boolean(this._udid);
  }
}

export default IOSCrashLog;
