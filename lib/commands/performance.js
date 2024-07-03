import _ from 'lodash';
import path from 'path';
import {fs, zip, logger, util, tempDir} from 'appium/support';
import {SubProcess, exec} from 'teen_process';
import {encodeBase64OrUpload} from '../utils';
import { XCRUN, requireXcrun } from '../xcrun';
import {waitForCondition} from 'asyncbox';
import B from 'bluebird';

const PERF_RECORD_FEAT_NAME = 'perf_record';
const PERF_RECORD_SECURITY_MESSAGE =
  'Performance measurement requires relaxing security for simulator. ' +
  `Please set '--relaxed-security' or '--allow-insecure' with '${PERF_RECORD_FEAT_NAME}' ` +
  'referencing https://github.com/appium/appium/blob/master/docs/en/writing-running-appium/security.md for more details.';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const STOP_TIMEOUT_MS = 3 * 60 * 1000;
const STARTUP_TIMEOUT_MS = 60 * 1000;
const DEFAULT_PROFILE_NAME = 'Activity Monitor';
const DEFAULT_EXT = '.trace';
const DEFAULT_PID = 'current';
const INSTRUMENTS = 'instruments';
const XCTRACE = 'xctrace';

async function requireXctrace() {
  const xcrunPath = await requireXcrun();
  try {
    await exec(xcrunPath, [XCTRACE, 'help']);
  } catch (e) {
    throw new Error(
      `${XCTRACE} is not available for the active Xcode version. ` +
        `Please make sure XCode is up to date. Original error: ${e.stderr || e.message}`,
    );
  }
  return xcrunPath;
}

async function requireInstruments() {
  try {
    return await fs.which(INSTRUMENTS);
  } catch (e) {
    throw new Error(
      `${INSTRUMENTS} has not been found in PATH. ` +
        `Please make sure XCode development tools are installed`,
    );
  }
}

export class PerfRecorder {
  /** @type {import('teen_process').SubProcess|null} */
  _process;
  constructor(reportRoot, udid, opts = {}) {
    this._process = null;
    this._zippedReportPath = '';
    this._timeout = opts.timeout && opts.timeout > 0 ? opts.timeout : DEFAULT_TIMEOUT_MS;
    this._profileName = opts.profileName || DEFAULT_PROFILE_NAME;
    this._reportPath = path.resolve(
      reportRoot,
      `appium_perf__${this._profileName.replace(/\W/g, '_')}__${Date.now()}${DEFAULT_EXT}`,
    );
    this._pid = opts.pid;
    this._udid = udid;
    this._logger = logger.getLogger(
      `${_.truncate(this._profileName, {length: 10})}@${this._udid.substring(0, 8)}`,
    );
    this._archivePromise = null;
  }

  get profileName() {
    return this._profileName;
  }

  async getOriginalReportPath() {
    return (await fs.exists(this._reportPath)) ? this._reportPath : '';
  }

  async getZippedReportPath() {
    // This is to prevent possible race conditions, because the archive operation
    // could be pretty time-intensive
    if (!this._archivePromise) {
      this._archivePromise = (async () => {
        const originalReportPath = await this.getOriginalReportPath();
        if (!originalReportPath) {
          return '';
        }
        const zippedReportPath = await tempDir.path({
          prefix: path.parse(originalReportPath).name,
          suffix: '.zip',
        });
        await zip.toArchive(zippedReportPath, {
          cwd: path.dirname(this._reportPath),
        });
        await fs.rimraf(path.dirname(this._reportPath));
        this._zippedReportPath = zippedReportPath;
        return this._zippedReportPath;
      })();
    }
    return await this._archivePromise;
  }

  isRunning() {
    return !!this._process?.isRunning;
  }

  async _enforceTermination() {
    if (this._process && this.isRunning()) {
      this._logger.debug('Force-stopping the currently running perf recording');
      try {
        await this._process.stop('SIGKILL');
      } catch (ign) {}
    }
    this._process = null;
    const performCleanup = async () => {
      try {
        await B.all(
          [this._zippedReportPath, path.dirname(this._reportPath)]
            .filter(Boolean)
            .map((x) => fs.rimraf(x)),
        );
      } catch (e) {
        this._logger.warn(e.message);
      }
    };
    if (this._archivePromise) {
      this._archivePromise
        // eslint-disable-next-line promise/prefer-await-to-then
        .finally(async () => {
          await performCleanup();
          this._archivePromise = null;
        })
        // eslint-disable-next-line promise/prefer-await-to-then, @typescript-eslint/no-empty-function
        .catch(() => {});
    }
    await performCleanup();
    return '';
  }

  async start() {
    let binaryPath;
    try {
      binaryPath = await requireXctrace();
    } catch (e) {
      this._logger.debug(e.message);
      this._logger.warn(`Defaulting to ${INSTRUMENTS} usage`);
      binaryPath = await requireInstruments();
    }

    const args = [];
    const toolName = path.basename(binaryPath) === XCRUN ? XCTRACE : INSTRUMENTS;
    if (toolName === XCTRACE) {
      args.push(
        XCTRACE,
        'record',
        '--device',
        this._udid,
        '--template',
        this._profileName,
        '--output',
        this._reportPath,
        '--time-limit',
        `${this._timeout}ms`,
      );
      if (this._pid) {
        args.push('--attach', `${this._pid}`);
      } else {
        args.push('--all-processes');
      }
    } else {
      // https://help.apple.com/instruments/mac/current/#/devb14ffaa5
      args.push(
        '-w',
        this._udid,
        '-t',
        this._profileName,
        '-D',
        this._reportPath,
        '-l',
        `${this._timeout}`,
      );
      if (this._pid) {
        args.push('-p', `${this._pid}`);
      }
    }
    const fullCmd = [binaryPath, ...args];
    this._process = new SubProcess(fullCmd[0], fullCmd.slice(1));
    this._archivePromise = null;
    this._logger.debug(`Starting performance recording: ${util.quote(fullCmd)}`);
    for (const streamName of ['stdout', 'stderr']) {
      this._process.on(`line-${streamName}`, (line) => this._logger.debug(`[${toolName}] ${line}`));
    }
    this._process.once('exit', async (code, signal) => {
      this._process = null;
      if (code === 0) {
        this._logger.debug('Performance recording exited without errors');
        try {
          // cache zipped report
          await this.getZippedReportPath();
        } catch (e) {
          this._logger.warn(e);
        }
      } else {
        await this._enforceTermination();
        this._logger.warn(`Performance recording exited with error code ${code}, signal ${signal}`);
      }
    });
    await this._process.start(0);
    try {
      await waitForCondition(
        async () => {
          if (await this.getOriginalReportPath()) {
            return true;
          }
          if (!this._process) {
            throw new Error(`${toolName} process died unexpectedly`);
          }
          return false;
        },
        {
          waitMs: STARTUP_TIMEOUT_MS,
          intervalMs: 500,
        },
      );
    } catch (e) {
      await this._enforceTermination();
      const listProfilesCommand =
        toolName === XCTRACE ? `${XCRUN} ${XCTRACE} list templates` : `${INSTRUMENTS} -s`;
      this._logger.errorAndThrow(
        `There is no ${DEFAULT_EXT} file found for performance profile ` +
          `'${this._profileName}'. Make sure the profile is supported on this device. ` +
          `You could use '${listProfilesCommand}' command to see the list of all available profiles. ` +
          `Check the server log for more details`,
      );
    }
    this._logger.info(`The performance recording has started. Will timeout in ${this._timeout}ms`);
  }

  async stop(force = false) {
    if (force) {
      return await this._enforceTermination();
    }

    if (!this.isRunning()) {
      this._logger.debug('Performance recording is not running. Returning the recent result');
      return await this.getZippedReportPath();
    }

    try {
      await this._process?.stop('SIGINT', STOP_TIMEOUT_MS);
    } catch (e) {
      this._logger.errorAndThrow(
        `Performance recording has failed to exit after ${STOP_TIMEOUT_MS}ms`,
      );
    }
    return await this.getZippedReportPath();
  }
}

export default {
  /**
   * Starts performance profiling for the device under test.
   *
   * Relaxing security is mandatory for simulators. It can always work for real devices.
   *
   * Since XCode 12 the method tries to use `xctrace` tool to record performance stats.
   *
   * The `instruments` developer utility is used as a fallback for this purpose if `xctrace` is not available.
   *
   * It is possible to record multiple profiles at the same time.
   *
   * Read [Recording, Pausing, and Stopping Traces](https://developer.apple.com/library/content/documentation/DeveloperTools/Conceptual/InstrumentsUserGuide/Recording,Pausing,andStoppingTraces.html) for more details.
   *
   * @param {number} timeout - The maximum count of milliseconds to record the profiling information.
   * @param {string} profileName - The name of existing performance profile to apply. Can also contain the full path to the chosen template on the server file system. Note: not all profiles are supported on mobile devices.
   * @param {number|'current'} [pid] -  The ID of the process to measure the performance for. Set it to `current` in order to measure the performance of the process, which belongs to the currently active application.  All processes running on the device are measured if `pid` is unset (the default setting).
   * @this {XCUITestDriver}
   */
  async mobileStartPerfRecord(
    timeout = DEFAULT_TIMEOUT_MS,
    profileName = DEFAULT_PROFILE_NAME,
    pid,
  ) {
    if (!this.isFeatureEnabled(PERF_RECORD_FEAT_NAME) && !this.isRealDevice()) {
      this.log.errorAndThrow(PERF_RECORD_SECURITY_MESSAGE);
    }

    if (!_.isEmpty(this._perfRecorders)) {
      for (const recorder of this._perfRecorders.filter((x) => x.profileName === profileName)) {
        if (recorder.isRunning()) {
          this.log.debug(
            `Performance recorder for '${profileName}' on device '${this.device.udid}' ` +
              ` is already running. Doing nothing`,
          );
          return;
        }
        _.pull(this._perfRecorders, recorder);
        await recorder.stop(true);
      }
    }

    let realPid;
    if (pid) {
      if (_.toLower(String(pid)) === DEFAULT_PID) {
        const appInfo = /** @type {import('./types').ActiveAppInfo} */ (
          await this.proxyCommand('/wda/activeAppInfo', 'GET')
        );
        realPid = appInfo.pid;
      } else {
        realPid = pid;
      }
    }
    const recorder = new PerfRecorder(await tempDir.openDir(), this.device.udid, {
      timeout: parseInt(String(timeout), 10),
      profileName,
      pid: parseInt(String(realPid), 10),
    });
    await recorder.start();
    this._perfRecorders = [...(this._perfRecorders || []), recorder];
  },

  /**
   * Stops performance recording operation previously started by {@linkcode XCUITestDriver.mobileStartPerfRecord mobile: startPerfRecord}.
   *
   * If the previous call has already been completed due to the timeout, then its result is returned immediately. An error is thrown if the performance recording failed to start.
   *
   * The resulting file in `.trace` format can be either returned directly as base64-encoded zip archive or uploaded to a remote location (such files can be pretty large). Afterwards it is possible to unarchive and open such files with Xcode Dev Tools.
   *
   * @param {string} [remotePath] - The path to the remote location, where the resulting zipped `.trace` file should be uploaded.  The following protocols are supported: `http`, `https`, `ftp`. Null or empty string value (the default setting) means the content of resulting file should be zipped, encoded as Base64 and passed as the endpoint response value. An exception will be thrown if the generated file is too big to fit into the available process memory.
   * @param {string} [user] - The name of the user for the remote authentication. Only works if `remotePath` is provided.
   * @param {string} [pass] - The password for the remote authentication. Only works if `remotePath` is provided.
   * @param {import('axios').Method} [method] -  The http multipart upload method name. Only works if `remotePath` is provided. Defaults to `PUT`
   * @param {string} profileName -  The name of existing performance profile to stop the recording for. Multiple recorders for different profile names could be executed at the same time.
   * @param {Record<string,any>} [headers] - Additional headers mapping for multipart http(s) uploads
   * @param {string} [fileFieldName] -  The name of the form field, where the file content BLOB should be stored for http(s) uploads. Defaults to `file`
   * @param {Record<string,any>|([string, any])[]} [formFields] - Additional form fields for multipart http(s) uploads
   *
   * @returns {Promise<string>} The resulting file in `.trace` format. This file can either be returned directly as base64-encoded `.zip` archive or uploaded to a remote location (note that such files may be large), _depending on the `remotePath` argument value._  Thereafter, the file may be unarchived and opened with Xcode Developer Tools.
   * @throws {Error} If no performance recording with given profile name/device udid combination
   * has been started before or the resulting .trace file has not been generated properly.
   * @this {XCUITestDriver}
   */
  async mobileStopPerfRecord(
    remotePath,
    user,
    pass,
    method,
    profileName = DEFAULT_PROFILE_NAME,
    headers,
    fileFieldName,
    formFields,
  ) {
    if (!this.isFeatureEnabled(PERF_RECORD_FEAT_NAME) && !this.isRealDevice()) {
      this.log.errorAndThrow(PERF_RECORD_SECURITY_MESSAGE);
    }

    if (_.isEmpty(this._perfRecorders)) {
      this.log.info('No performance recorders have been started. Doing nothing');
      return '';
    }

    const recorders = this._perfRecorders.filter((x) => x.profileName === profileName);
    if (_.isEmpty(recorders)) {
      this.log.errorAndThrow(
        `There are no records for performance profile '${profileName}' ` +
          `and device ${this.device.udid}. Have you started the profiling before?`,
      );
    }

    const recorder = _.first(recorders);
    const resultPath = await /** @type {PerfRecorder} */ (recorder).stop();
    if (!(await fs.exists(resultPath))) {
      this.log.errorAndThrow(
        `There is no ${DEFAULT_EXT} file found for performance profile '${profileName}' ` +
          `and device ${this.device.udid}. Make sure the selected profile is supported on this device`,
      );
    }

    const result = await encodeBase64OrUpload(resultPath, remotePath, {
      user,
      pass,
      method,
      headers,
      fileFieldName,
      formFields,
    });
    _.pull(this._perfRecorders, recorder);
    await fs.rimraf(resultPath);
    return result;
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
