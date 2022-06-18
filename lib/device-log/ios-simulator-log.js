import _ from 'lodash';
import { IOSLog } from './ios-log';
import { logger } from 'appium/support';
import { exec } from 'teen_process';

const log = logger.getLogger('IOSSimulatorLog');

const START_TIMEOUT = 10000;

class IOSSimulatorLog extends IOSLog {
  constructor ({sim, showLogs, xcodeVersion, iosSimulatorLogsPredicate}) {
    super();
    this.sim = sim;
    this.showLogs = !!showLogs;
    this.xcodeVersion = xcodeVersion;
    this.predicate = iosSimulatorLogsPredicate;
    this.proc = null;
  }

  async startCapture () {
    if (_.isUndefined(this.sim.udid)) {
      throw new Error(`Log capture requires a sim udid`);
    }

    if (!await this.sim.isRunning()) {
      throw new Error(`iOS Simulator with udid '${this.sim.udid}' is not running`);
    }
    const spawnArgs = [
      'log',
      'stream',
      '--style', 'compact',
    ];
    if (this.predicate) {
      spawnArgs.push('--predicate', this.predicate);
    }
    log.debug(`Starting log capture for iOS Simulator with udid '${this.sim.udid}' ` +
      `using simctl`);
    try {
      // cleanup existing listeners if the previous session has not been terminated properly
      await exec('pkill', ['-f', [this.sim.udid, ...spawnArgs].join(' ')]);
    } catch (ign) {}
    try {
      this.proc = await this.sim.simctl.spawnSubProcess(spawnArgs);
      await this.finishStartingLogCapture();
    } catch (e) {
      throw new Error(`Simulator log capture failed. Original error: ${e.message}`);
    }
  }

  async finishStartingLogCapture () {
    if (!this.proc) {
      log.errorAndThrow('Could not capture simulator log');
    }
    let firstLine = true;
    let logRow = '';
    this.proc.on('output', (stdout, stderr) => {
      if (stdout) {
        if (firstLine) {
          if (stdout.endsWith('\n')) {
            // don't store the first line of the log because it came before the sim was launched
            firstLine = false;
          }
        } else {
          logRow += stdout;
          if (stdout.endsWith('\n')) {
            this.onOutput(logRow);
            logRow = '';
          }
        }
      }
      if (stderr) {
        this.onOutput(logRow, 'STDERR');
      }
    });

    let sd = (stdout, stderr) => {
      if (/execvp\(\)/.test(stderr)) {
        throw new Error('iOS log capture process failed to start');
      }
      return stdout || stderr;
    };
    await this.proc.start(sd, START_TIMEOUT);
  }

  async stopCapture () {
    if (!this.proc) {
      return;
    }
    await this.killLogSubProcess();
    this.proc = null;
  }

  async killLogSubProcess () {
    if (!this.proc.isRunning) {
      return;
    }
    log.debug('Stopping iOS log capture');
    try {
      await this.proc.stop('SIGTERM', 1000);
    } catch (e) {
      if (!this.proc.isRunning) {
        return;
      }
      log.warn('Cannot stop log capture process. Sending SIGKILL');
      await this.proc.stop('SIGKILL');
    }
  }

  get isCapturing () {
    return this.proc && this.proc.isRunning;
  }

  onOutput (logRow, prefix = '') {
    const logs = _.cloneDeep(logRow.split('\n'));
    for (const logLine of logs) {
      if (!logLine) continue; // eslint-disable-line curly
      this.broadcast(logLine);
      if (this.showLogs) {
        const space = prefix.length > 0 ? ' ' : '';
        log.info(`[IOS_SYSLOG_ROW${space}${prefix}] ${logLine}`);
      }
    }
  }
}

export { IOSSimulatorLog };
export default IOSSimulatorLog;
