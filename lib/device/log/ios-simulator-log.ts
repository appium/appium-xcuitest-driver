import _ from 'lodash';
import {SubProcess, exec} from 'teen_process';
import {util} from 'appium/support';
import { LineConsumingLog } from './line-consuming-log';
import { transports, createLogger, format, Logger } from 'winston';
import type { Simulator } from 'appium-ios-simulator';
import type { AppiumLogger } from '@appium/types';
import fs from 'node:fs/promises';

const EXECVP_ERROR_PATTERN = /execvp\(\)/;
const LOG_STREAMING_PROCESS_NAME_PATTERN = /^com\.apple\.xpc\.launchd\.oneshot\.0x[0-f]+\.log$/;

const START_TIMEOUT = 10000;

export interface IOSSimulatorLogOptions {
  sim: Simulator;
  showLogs?: boolean;
  iosSimulatorLogsPredicate?: string;
  simulatorLogLevel?: string;
  log: AppiumLogger;
  iosSyslogFile?: string;
}

export class IOSSimulatorLog extends LineConsumingLog {
  private readonly sim: Simulator;
  private readonly showLogs: boolean;
  private readonly predicate?: string;
  private readonly logLevel?: string;
  private proc: SubProcess | null;
  private readonly iosSyslogFile?: string;
  private syslogLogger: Logger | null;

  constructor(opts: IOSSimulatorLogOptions) {
    super({log: opts.log});
    this.sim = opts.sim;
    this.showLogs = !!opts.showLogs;
    this.predicate = opts.iosSimulatorLogsPredicate;
    this.logLevel = opts.simulatorLogLevel;
    this.proc = null;
    this.iosSyslogFile = opts.iosSyslogFile;
    this.syslogLogger = null;
  }

  override async startCapture(): Promise<void> {
    if (_.isUndefined(this.sim.udid)) {
      throw new Error(`Log capture requires a sim udid`);
    }
    if (!(await this.sim.isRunning())) {
      throw new Error(`iOS Simulator with udid '${this.sim.udid}' is not running`);
    }
    if (this.iosSyslogFile && this.showLogs) {
      await this.clearExistingSyslog();
      try {
        this.syslogLogger = createLogger({
          level: 'info',
          format: format.combine(format.timestamp(), format.simple()),
          transports: [new transports.File({filename: this.iosSyslogFile})],
          exitOnError: false
        });
        this.log.debug(`iOS syslog will be written to: '${this.iosSyslogFile}'`);
      } catch (e) {
        this.log.warn(`Could not set up iOS syslog logger for '${this.iosSyslogFile}': ${e.message}`);
        this.syslogLogger = null;
      }
    }
    const spawnArgs = ['log', 'stream', '--style', 'compact'];
    if (this.predicate) {
      spawnArgs.push('--predicate', this.predicate);
    }
    if (this.logLevel) {
      spawnArgs.push('--level', this.logLevel);
    }
    this.log.debug(
      `Starting log capture for iOS Simulator with udid '${this.sim.udid}' ` +
      `via simctl using the following arguments '${util.quote(spawnArgs)}'`
    );
    await this.cleanupObsoleteLogStreams();
    try {
      this.proc = await this.sim.simctl.spawnSubProcess(spawnArgs);
      await this.finishStartingLogCapture();
    } catch (e) {
      this.shutdownSyslogger();
      throw new Error(`Simulator log capture failed. Original error: ${e.message}`);
    }
  }

  override async stopCapture(): Promise<void> {
    if (!this.proc) {
      return;
    }
    await this.killLogSubProcess();
    this.proc = null;
    this.shutdownSyslogger();
  }

  override get isCapturing(): boolean {
    return Boolean(this.proc?.isRunning);
  }

  private async clearExistingSyslog(): Promise<void> {
    if (this.iosSyslogFile === undefined) {
      this.log.debug('iOS Syslog file path is not defined, skipping deletion.');
      return;
    }
    try {
      await fs.unlink(this.iosSyslogFile);
      this.log.debug(`Existing iOS Syslog file: '${this.iosSyslogFile}' deleted.`);
    } catch (unlinkErr) {
      if (unlinkErr.code !== 'ENOENT') {
        this.log.warn(`Could not delete existing syslog file '${this.iosSyslogFile}': ${unlinkErr.message}`);
      }
    }
  }

  private shutdownSyslogger(): void {
    if (this.syslogLogger) {
      this.log.debug(`Closing iOS syslog file: '${this.iosSyslogFile}'`);
      const fileTransport = this.syslogLogger.transports.find(
        (t) => (t instanceof transports.File) && (t.filename === this.iosSyslogFile)
      );
      if (fileTransport) {
        fileTransport.end?.();
        this.syslogLogger.remove(fileTransport);
      }
      this.syslogLogger = null;
    }
  }

  private onOutput(logRow: string, prefix: string = ''): void {
    this.broadcast(logRow);
    const space = prefix.length > 0 ? ' ' : '';
    if (this.showLogs && !this.iosSyslogFile) {
      this.log.info(`[IOS_SYSLOG_ROW${space}${prefix}] ${logRow}`);
    } else if (this.iosSyslogFile && this.showLogs) {
      this.writeToSyslogFile(`[IOS_SYSLOG_ROW${space}${prefix}] ${logRow}`);
    }
  }

  /**
   * Writes the given log row to the dedicated iOS syslog file if the logger is active.
   * @param {string} logRow - The log line to write.
   * @private
   */
  private writeToSyslogFile(logRow: string): void {
    if (this.syslogLogger && this.showLogs) {
      this.syslogLogger.info(logRow);
    }
  }

  private async killLogSubProcess(): Promise<void> {
    if (!this.proc?.isRunning) {
      return;
    }
    this.log.debug('Stopping iOS log capture');
    try {
      await this.proc.stop('SIGTERM', 1000);
    } catch {
      if (!this.proc.isRunning) {
        return;
      }
      this.log.warn('Cannot stop log capture process. Sending SIGKILL');
      await this.proc.stop('SIGKILL');
    }
  }

  private async finishStartingLogCapture(): Promise<void> {
    if (!this.proc) {
      throw this.log.errorWithException('Could not capture simulator log');
    }
    for (const streamName of ['stdout', 'stderr']) {
      this.proc.on(`line-${streamName}`, (line: string) => {
        this.onOutput(line, ...(streamName === 'stderr' ? ['STDERR'] : []));
      });
    }
    const startDetector = (stdout: string, stderr: string) => {
      if (EXECVP_ERROR_PATTERN.test(stderr)) {
        throw new Error('iOS log capture process failed to start');
      }
      return Boolean(stdout || stderr);
    };
    await this.proc.start(startDetector, START_TIMEOUT);
  }

  private async cleanupObsoleteLogStreams(): Promise<void> {
    const processes = await this.sim.ps();
    const pids = processes
      .filter(({name}) => LOG_STREAMING_PROCESS_NAME_PATTERN.test(name))
      .map(({pid}) => pid);
    if (_.isEmpty(pids)) {
      return;
    }
    try {
      await exec('kill', pids.map(String));
    } catch (e) {
      this.log.warn(
        `Could not terminate one or more obsolete log streams: ${e.stderr || e.message}`
      );
    }
  }
}

export default IOSSimulatorLog;
