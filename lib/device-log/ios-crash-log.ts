import {fs, tempDir} from 'appium/support';
import B from 'bluebird';
import path from 'path';
import _ from 'lodash';
import {Pyidevice} from '../real-device-clients/py-ios-device-client';
import IOSLog from './ios-log';
import { toLogEntry } from './helpers';
import type { AppiumLogger } from '@appium/types';
import type { BaseDeviceClient } from '../real-device-clients/base-device-client';
import type { Simulator } from 'appium-ios-simulator';
import type { LogEntry } from '../commands/types';

const REAL_DEVICE_MAGIC = '3620bbb0-fb9f-4b62-a668-896f2edc4d88';
const MAGIC_SEP = '/';
// The file format has been changed from '.crash' to '.ips' since Monterey.
const CRASH_REPORTS_GLOB_PATTERN = '**/*.@(crash|ips)';

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
    super({log: opts.log});
    this._udid = opts.udid;
    this._realDeviceClient = this._udid
      ? new Pyidevice({
        udid: this._udid,
        log: opts.log,
      })
      : null;
    this._logDir = opts.udid
      ? null
      : path.resolve(process.env.HOME || '/', 'Library', 'Logs', 'DiagnosticReports');
    this._sim = opts.sim;
    this._recentCrashFiles = [];
    this._started = false;
  }

  override async startCapture(): Promise<void> {
    this._recentCrashFiles = await this.listCrashFiles();
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
    const crashFiles = await this.listCrashFiles();
    const diffFiles = _.difference(crashFiles, this._recentCrashFiles);
    if (_.isEmpty(diffFiles)) {
      return [];
    }

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
      const promises: Promise<TSerializedEntry>[] = [];
      for (const filePath of paths) {
        promises.push((async () => {
          let fullPath = filePath;
          if (_.includes(fullPath, REAL_DEVICE_MAGIC)) {
            const fileName = _.last(fullPath.split(MAGIC_SEP)) as string;
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
          return [await fs.readFile(fullPath, 'utf8'), ctime.getTime()];
        })() as Promise<TSerializedEntry>);
      }
      for (const entry of await B.all(promises)) {
        this.broadcast(entry);
      }
    } finally {
      await fs.rimraf(tmpRoot);
    }
  }

  private async _gatherFromRealDevice(): Promise<string[]> {
    if (!this._realDeviceClient || !this._realDeviceClient.assertExists(false)) {
      return [];
    }

    return (await this._realDeviceClient.listCrashes())
      .map((x) => `${REAL_DEVICE_MAGIC}${MAGIC_SEP}${x}`);
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
    // For Simulator only include files, that contain current UDID
    return await B.filter(foundFiles, async (x) => {
      try {
        const content = await fs.readFile(x, 'utf8');
        return content.toUpperCase().includes((this._sim as Simulator).udid.toUpperCase());
      } catch (err) {
        return false;
      }
    });
  }

  async listCrashFiles(): Promise<string[]> {
    return this._udid ? await this._gatherFromRealDevice() : await this._gatherFromSimulator();
  }
}

export default IOSCrashLog;
