import _ from 'lodash';
import {IOSLog} from './ios-log';
import {logger} from 'appium/support';
import {exec} from 'teen_process';

const log = logger.getLogger('IOSSimulatorLog');

const START_TIMEOUT = 10000;

class IOSSimulatorLog extends IOSLog {
  constructor({sim, showLogs, xcodeVersion, iosSimulatorLogsPredicate}) {
    super();
    this.sim = sim;
    this.showLogs = !!showLogs;
    this.xcodeVersion = xcodeVersion;
    this.predicate = iosSimulatorLogsPredicate;
    this.proc = null;
  }

  /**
   * @override
   */
  async startCapture() {
    if (_.isUndefined(this.sim.udid)) {
      throw new Error(`Log capture requires a sim udid`);
    }

    if (!(await this.sim.isRunning())) {
      throw new Error(`iOS Simulator with udid '${this.sim.udid}' is not running`);
    }
    const spawnArgs = ['log', 'stream', '--style', 'compact'];
    if (this.predicate) {
      spawnArgs.push('--predicate', this.predicate);
    }
    log.debug(
      `Starting log capture for iOS Simulator with udid '${this.sim.udid}' ` + `using simctl`,
    );
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

  /**
   * @override
   */
  async stopCapture() {
    if (!this.proc) {
      return;
    }
    await this.killLogSubProcess();
    this.proc = null;
  }

  /**
   * @override
   */
  get isCapturing() {
    return this.proc && this.proc.isRunning;
  }

  /**
   * @param {string} logRow
   * @param {string} [prefix='']
   */
  onOutput(logRow, prefix = '') {
    this.broadcast(logRow);
    if (this.showLogs) {
      const space = prefix.length > 0 ? ' ' : '';
      log.info(`[IOS_SYSLOG_ROW${space}${prefix}] ${logRow}`);
    }
  }

  async killLogSubProcess() {
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

  async finishStartingLogCapture() {
    if (!this.proc) {
      log.errorAndThrow('Could not capture simulator log');
    }

    for (const streamName of ['stdout', 'stderr']) {
      this.proc.on(`lines-${streamName}`, (/** @type {string[]} */ lines) => {
        for (const line of lines) {
          this.onOutput(line, ...(streamName === 'stderr' ? ['STDERR'] : []));
        }
      });
    }

    const startDetector = (/** @type {string} */ stdout, /** @type {string} */ stderr) => {
      if (/execvp\(\)/.test(stderr)) {
        throw new Error('iOS log capture process failed to start');
      }
      return stdout || stderr;
    };
    await this.proc.start(startDetector, START_TIMEOUT);
  }
}

export {IOSSimulatorLog};
export default IOSSimulatorLog;
