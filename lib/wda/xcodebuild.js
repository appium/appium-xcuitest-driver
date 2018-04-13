import { retryInterval } from 'asyncbox';
import { SubProcess, exec } from 'teen_process';
import { fs, logger } from 'appium-support';
import log from '../logger';
import B from 'bluebird';
import { fixForXcode7, fixForXcode9, setRealDeviceSecurity, generateXcodeConfigFile,
         setXctestrunFile, updateProjectFile, resetProjectFile, killProcess } from './utils';
import { getPidUsingPattern } from '../utils';
import _ from 'lodash';
import path from 'path';


const DEFAULT_SIGNING_ID = "iPhone Developer";
const BUILD_TEST_DELAY = 1000;

const DERIVED_DATA_FOLDER_REGEXP = /(\/.+\/DerivedData\/WebDriverAgent-[^\/]+)/;
const DERIVED_DATA_LOG_REGEXP = /\s+(\/.+\/WebDriverAgentRunner-.+\/.+\.log)/;
const DERIVED_DATA_GREP_EXPRESSION = '/WebDriverAgentRunner-';

const xcodeLog = logger.getLogger('Xcode');


class XcodeBuild {
  constructor (xcodeVersion, device, args = {}) {
    this.xcodeVersion = xcodeVersion;

    this.device = device;

    this.realDevice = args.realDevice;

    this.agentPath = args.agentPath;
    this.bootstrapPath = args.bootstrapPath;

    this.platformVersion = args.platformVersion;

    this.showXcodeLog = !!args.showXcodeLog;

    this.xcodeConfigFile = args.xcodeConfigFile;
    this.xcodeOrgId = args.xcodeOrgId;
    this.xcodeSigningId = args.xcodeSigningId || DEFAULT_SIGNING_ID;
    this.keychainPath = args.keychainPath;
    this.keychainPassword = args.keychainPassword;

    this.prebuildWDA = args.prebuildWDA;
    this.usePrebuiltWDA = args.usePrebuiltWDA;
    this.useSimpleBuildTest = args.useSimpleBuildTest;

    this.useXctestrunFile = args.useXctestrunFile;

    this.launchTimeout = args.launchTimeout;

    this.wdaRemotePort = args.wdaRemotePort;

    this.updatedWDABundleId = args.updatedWDABundleId;
  }

  async init (noSessionProxy) {
    this.noSessionProxy = noSessionProxy;

    if (this.useXctestrunFile) {
      if (this.xcodeVersion.major <= 7) {
        log.errorAndThrow('useXctestrunFile can only be used with xcode version 8 onwards');
      }
      this.xctestrunFilePath = await setXctestrunFile(this.realDevice, this.device.udid, this.platformVersion, this.bootstrapPath, this.wdaRemotePort);
      return;
    }

    if (this.xcodeVersion.major === 7 || (this.xcodeVersion.major === 8 && this.xcodeVersion.minor === 0)) {
      log.debug(`Using Xcode ${this.xcodeVersion.versionString}, so fixing WDA codebase`);
      await fixForXcode7(this.bootstrapPath, true);
    }

    if (this.xcodeVersion.major === 9) {
      log.debug(`Using Xcode ${this.xcodeVersion.versionString}, so fixing WDA codebase`);
      await fixForXcode9(this.bootstrapPath, true);
    }

    // if necessary, update the bundleId to user's specification
    if (this.realDevice) {
      // In case the project still has the user specific bundle ID, reset the project file first.
      // - We do this reset even if updatedWDABundleId is not specified,
      //   since the previous updatedWDABundleId test has generated the user specific bundle ID project file.
      // - We don't call resetProjectFile for simulator,
      //   since simulator test run will work with any user specific bundle ID.
      await resetProjectFile(this.agentPath);
      if (this.updatedWDABundleId) {
        await updateProjectFile(this.agentPath, this.updatedWDABundleId);
      }
    }
  }

  async retrieveDerivedDataPath () {
    if (this._derivedDataPath) {
      return this._derivedDataPath;
    }

    // try a number of ways to find the derived data folder for this run
    const pid = await getPidUsingPattern(`xcodebuild.*${this.device.udid}`);
    if (!pid) {
      log.debug(`Cannot find xcodebuild's process id, so unable to retrieve DerivedData folder path`);
      return;
    }
    let stdout = '';
    try {
      const execInfo = await exec('lsof', ['-p', pid]);
      stdout = execInfo.stdout;
    } catch (err) {
      log.debug(`Cannot get the list of files opened by xcodebuild process (pid: ${pid}) because of '${err.stderr}'`);
      return;
    }
    // try to find a derived data folder open by xcodebuild
    let match = DERIVED_DATA_FOLDER_REGEXP.exec(stdout);
    if (!match) {
      // no match found, so try to find the log file and search inside for the derived data instead
      log.debug(`Cannot find a match for DerivedData folder path from lsof. Trying to access logs`);
      match = DERIVED_DATA_LOG_REGEXP.exec(stdout);
      if (!match) {
        // still no go. We are done
        log.debug(`Cannot find a match for xcodebuild log file. No derived data folder will be found`);
        return;
      }
      // now parse the log file for the derived data folder
      const logFile = match[1];
      try {
        // grep on the log file, since it might be too big to fit it completely into the memory
        const grepData = await exec('grep', [DERIVED_DATA_GREP_EXPRESSION, logFile]);
        match = DERIVED_DATA_FOLDER_REGEXP.exec(grepData.stdout);
        if (!match) {
          // nothing found. We are done
          log.debug(`Cannot find the derived data location from the xcodebuild log file '${logFile}'`);
          return;
        }
      } catch (e) {
        log.warn(`Cannot grep on the the xcodebuild log file '${logFile}'. Original error: ${e.message}`);
        return;
      }
    }

    // at this point we have gotten a match by one of the two ways above, so save it
    this._derivedDataPath = match[1];

    return this._derivedDataPath;
  }

  async reset () {
    // if necessary, reset the bundleId to original value
    if (this.realDevice && this.updatedWDABundleId) {
      await resetProjectFile(this.agentPath);
    }
  }

  async prebuild () {
    if (this.xcodeVersion.major === 7) {
      log.debug(`Capability 'prebuildWDA' set, but on xcode version ${this.xcodeVersion.versionString} so skipping`);
      return;
    }

    // first do a build phase
    log.debug('Pre-building WDA before launching test');
    this.usePrebuiltWDA = true;
    this.xcodebuild = await this.createSubProcess(true);
    await this.start(true);

    this.xcodebuild = null;

    // pause a moment
    await B.delay(BUILD_TEST_DELAY);
  }

  getCommand (buildOnly = false) {
    let cmd = 'xcodebuild';
    let args;

    // figure out the targets for xcodebuild
    if (this.xcodeVersion.major < 8) {
      args =[
        'build',
        'test',
      ];
    } else {
      let [buildCmd, testCmd] = this.useSimpleBuildTest ? ['build', 'test'] : ['build-for-testing', 'test-without-building'];
      if (buildOnly) {
        args = [buildCmd];
      } else if (this.usePrebuiltWDA || this.useXctestrunFile) {
        args = [testCmd];
      } else {
        args = [buildCmd, testCmd];
      }
    }

    if (this.useXctestrunFile) {
      args.push('-xctestrun', this.xctestrunFilePath);
    } else {
      args.push('-project', this.agentPath, '-scheme', 'WebDriverAgentRunner');
    }
    args.push('-destination', `id=${this.device.udid}`);

    const versionMatch = new RegExp(/^(\d+)\.(\d+)/).exec(this.platformVersion);
    if (versionMatch) {
      args.push(`IPHONEOS_DEPLOYMENT_TARGET=${versionMatch[1]}.${versionMatch[2]}`);
    } else {
      log.warn(`Cannot parse major and minor version numbers from platformVersion "${this.platformVersion}". ` +
               'Will build for the default platform instead');
    }

    if (this.realDevice && this.xcodeConfigFile) {
      log.debug(`Using Xcode configuration file: '${this.xcodeConfigFile}'`);
      args.push('-xcconfig', this.xcodeConfigFile);
    }

    return {cmd, args};
  }

  async createSubProcess (buildOnly = false) {
    if (!this.useXctestrunFile) {
      if (this.realDevice) {
        if (this.keychainPath && this.keychainPassword) {
          await setRealDeviceSecurity(this.keychainPath, this.keychainPassword);
        }
        if (this.xcodeOrgId && this.xcodeSigningId && !this.xcodeConfigFile) {
          this.xcodeConfigFile = await generateXcodeConfigFile(this.xcodeOrgId, this.xcodeSigningId);
        }
      }
    }

    let {cmd, args} = this.getCommand(buildOnly);
    log.debug(`Beginning ${buildOnly ? 'build' : 'test'} with command '${cmd} ${args.join(' ')}' ` +
              `in directory '${this.bootstrapPath}'`);
    const env = Object.assign({}, process.env, {USE_PORT: this.wdaRemotePort});
    let xcodebuild = new SubProcess(cmd, args, {
      cwd: this.bootstrapPath,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let logXcodeOutput = this.showXcodeLog;
    log.debug(`Output from xcodebuild ${logXcodeOutput ? 'will' : 'will not'} be logged. To change this, use 'showXcodeLog' desired capability`);
    xcodebuild.on('output', (stdout, stderr) => {
      let out = stdout || stderr;
      // we want to pull out the log file that is created, and highlight it
      // for diagnostic purposes
      if (out.indexOf('Writing diagnostic log for test session to') !== -1) {
        // pull out the first line that begins with the path separator
        // which *should* be the line indicating the log file generated
        xcodebuild.logLocation = _.first(_.remove(out.trim().split('\n'), (v) => v.indexOf(path.sep) === 0));
        log.debug(`Log file for xcodebuild test: ${xcodebuild.logLocation}`);
      }

      // if we have an error we want to output the logs
      // otherwise the failure is inscrutible
      // but do not log permission errors from trying to write to attachments folder
      if (out.indexOf('Error Domain=') !== -1 &&
          out.indexOf('Error writing attachment data to file') === -1 &&
          out.indexOf('Failed to remove screenshot at path') === -1) {
        logXcodeOutput = true;

        // terrible hack to handle case where xcode return 0 but is failing
        xcodebuild._wda_error_occurred = true;
      }

      if (logXcodeOutput) {
        // do not log permission errors from trying to write to attachments folder
        if (out.indexOf('Error writing attachment data to file') === -1) {
          for (let line of out.split('\n')) {
            xcodeLog.info(line);
          }
        }
      }
    });

    return xcodebuild;
  }

  async start (buildOnly = false) {
    this.xcodebuild = await this.createSubProcess(buildOnly);

    // wrap the start procedure in a promise so that we can catch, and report,
    // any startup errors that are thrown as events
    return await new B((resolve, reject) => {
      this.xcodebuild.on('exit', async (code, signal) => {
        log.info(`xcodebuild exited with code '${code}' and signal '${signal}'`);
        // print out the xcodebuild file if users have asked for it
        if (this.showXcodeLog && this.xcodebuild.logLocation) {
          xcodeLog.info(`Contents of xcodebuild log file '${this.xcodebuild.logLocation}':`);
          try {
            let data = await fs.readFile(this.xcodebuild.logLocation, 'utf-8');
            for (let line of data.split('\n')) {
              xcodeLog.info(line);
            }
          } catch (err) {
            log.debug(`Unable to access xcodebuild log file: '${err.message}'`);
          }
        }
        this.xcodebuild.processExited = true;
        if (this.xcodebuild._wda_error_occurred || (!signal && code !== 0)) {
          return reject(new Error(`xcodebuild failed with code ${code}`));
        }
        // in the case of just building, the process will exit and that is our finish
        if (buildOnly) {
          return resolve();
        }
      });

      return (async () => {
        try {
          let startTime = process.hrtime();
          await this.xcodebuild.start();
          this.xcodebuild.proc.unref();
          if (!buildOnly) {
            let status = await this.waitForStart(startTime);
            resolve(status);
          }
        } catch (err) {
          let msg = `Unable to start WebDriverAgent: ${err}`;
          log.error(msg);
          reject(new Error(msg));
        }
      })();
    });
  }

  async waitForStart (startTime) {
    // try to connect once every 0.5 seconds, until `launchTimeout` is up
    log.debug(`Waiting up to ${this.launchTimeout}ms for WebDriverAgent to start`);
    let currentStatus = null;
    try {
      let retries = parseInt(this.launchTimeout / 500, 10);
      await retryInterval(retries, 500, async () => {
        if (this.xcodebuild.processExited) {
          // there has been an error elsewhere and we need to short-circuit
          return;
        }
        const proxyTimeout = this.noSessionProxy.timeout;
        this.noSessionProxy.timeout = 1000;
        try {
          currentStatus = await this.noSessionProxy.command('/status', 'GET');
          if (currentStatus && currentStatus.ios && currentStatus.ios.ip) {
            this.agentUrl = currentStatus.ios.ip;
            log.debug(`WebDriverAgent running on ip '${this.agentUrl}'`);
          }
        } catch (err) {
          throw new Error(`Unable to connect to running WebDriverAgent: ${err.message}`);
        } finally {
          this.noSessionProxy.timeout = proxyTimeout;
        }
      });

      if (this.xcodebuild.processExited) {
        // there has been an error elsewhere and we need to short-circuit
        return currentStatus;
      }

      let endTime = process.hrtime(startTime);
      // must get [s, ns] array into ms
      let startupTime = parseInt((endTime[0] * 1e9 + endTime[1]) / 1e6, 10);
      log.debug(`WebDriverAgent successfully started after ${startupTime}ms`);
    } catch (err) {
      // at this point, if we have not had any errors from xcode itself (reported
      // elsewhere), we can let this go through and try to create the session
      log.debug(err.message);
      log.warn(`Getting status of WebDriverAgent on device timed out. Continuing`);
    }
    return currentStatus;
  }

  async quit () {
    await killProcess('xcodebuild', this.xcodebuild);
  }
}

export { XcodeBuild };
export default XcodeBuild;
