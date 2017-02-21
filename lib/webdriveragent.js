import _ from 'lodash';
import path from 'path';
import url from 'url';
import B from 'bluebird';
import { retryInterval } from 'asyncbox';
import { SubProcess } from 'teen_process';
import { JWProxy } from 'appium-base-driver';
import { fs } from 'appium-support';
import log from './logger';
import { getLogger } from 'appium-logger';
import { killAppUsingAppName, generateXcodeConfigFile } from './utils.js';
import request from 'request-promise';
import { updateProjectFile, resetProjectFile, checkForDependencies,
         setRealDeviceSecurity, fixXCUICoordinateFile } from './webdriveragent-utils';


const xcodeLog = getLogger('Xcode');
const iproxyLog = getLogger('iProxy');

const BOOTSTRAP_PATH = path.resolve(__dirname, '..', '..', 'WebDriverAgent');
const WDA_BUNDLE_ID = 'com.apple.test.WebDriverAgentRunner-Runner';
const DEFAULT_SIGNING_ID = "iPhone Developer";
const WDA_LAUNCH_TIMEOUT = 60 * 1000;
const IPROXY_TIMEOUT = 5000;
const WDA_AGENT_PORT = 8100;
const WDA_BASE_URL = 'http://localhost';

class WebDriverAgent {

  // agentPath (optional): Path to WebdriverAgent Executable (inside WebDriverAgent.app)
  constructor (xcodeVersion, args = {}) {
    this.xcodeVersion = xcodeVersion;

    this.device = args.device;
    this.platformVersion = args.platformVersion;
    this.host = args.host;
    this.realDevice = !!args.realDevice;

    this.setWDAPaths(args.bootstrapPath, args.agentPath);

    this.wdaLocalPort = args.wdaLocalPort;
    this.showXcodeLog = !!args.showXcodeLog;
    this.xcodeConfigFile = args.xcodeConfigFile;
    this.xcodeOrgId = args.xcodeOrgId;
    this.xcodeSigningId = args.xcodeSigningId || DEFAULT_SIGNING_ID;
    this.keychainPath = args.keychainPath;
    this.keychainPassword = args.keychainPassword;

    this.usePrebuiltWDA = args.usePrebuiltWDA;
    this.webDriverAgentUrl = args.webDriverAgentUrl;

    this.updatedWDABundleId = args.updatedWDABundleId;

    this.expectIProxyErrors = true;

    this.wdaLaunchTimeout = args.wdaLaunchTimeout || WDA_LAUNCH_TIMEOUT;
    this.wdaConnectionTimeout = args.wdaConnectionTimeout;
  }

  setWDAPaths (bootstrapPath, agentPath) {
    // allow the user to specify a place for WDA. This is undocumented and
    // only here for the purposes of testing development of WDA
    this.bootstrapPath = bootstrapPath || BOOTSTRAP_PATH;
    log.info(`Using WDA path: '${this.bootstrapPath}'`);

    // for backward compatibility we need to be able to specify agentPath too
    this.agentPath = agentPath || path.resolve(this.bootstrapPath, 'WebDriverAgent.xcodeproj');
    log.info(`Using WDA agent: '${this.agentPath}'`);
  }

  async uninstall () {
    log.debug(`Removing WDA application from device`);
    await this.device.removeApp(WDA_BUNDLE_ID);
  }

  async launch (sessionId) {
    if (this.webDriverAgentUrl) {
      log.info(`Using provided WebdriverAgent at '${this.webDriverAgentUrl}'`);
      this.url = this.webDriverAgentUrl;
      this.setupProxy(sessionId);
      return this.webDriverAgentUrl;
    }

    log.info('Launching WebDriverAgent on the device');

    if (!await fs.exists(this.agentPath)) {
      throw new Error(`Trying to use WebDriverAgent project at '${this.agentPath}' but the ` +
                      'file does not exist');
    }

    // make sure that the WDA dependencies have been built
    await checkForDependencies(this.bootstrapPath);

    // if necessary, update the bundleId to user's specification
    if (this.realDevice && this.updatedWDABundleId) {
      await updateProjectFile(this.agentPath, this.updatedWDABundleId);
    }

    //kill all hanging processes
    await this.killHangingProcesses();

    if (this.xcodeVersion.major === 8 && this.xcodeVersion.minor === 0) {
      log.debug('Using Xcode 8.0, so fixing header files');
      await fixXCUICoordinateFile(this.bootstrapPath);
    }

    this.xcodebuild = await this.createXcodeBuildSubProcess();

    if (this.realDevice) {
      this.iproxy = this.createiProxySubProcess(this.url.port, WDA_AGENT_PORT);
      await this.startiproxy();
    }

    this.setupProxy(sessionId);

    // start the xcodebuild process
    await this.startXcodebuild();
  }

  setupProxy (sessionId) {
    this.jwproxy = new JWProxy({
      server: this.url.hostname,
      port: this.url.port,
      base: '',
      timeout: this.wdaConnectionTimeout,
    });
    this.jwproxy.sessionId = sessionId;
    this.proxyReqRes = this.jwproxy.proxyReqRes.bind(this.jwproxy);
  }

  getXcodeBuildCommand () {
    let cmd = 'xcodebuild';
    let args;

    // figure out the targets for xcodebuild
    if (this.xcodeVersion.major < 8) {
      if (this.usePrebuiltWDA) {
        let msg = `'usePrebuiltWDA' set, but on Xcode ` +
                  `'${this.xcodeVersion.versionString}', so skipping, as it ` +
                  `needs a version >= 8`;
        log.warn(msg);
      }
      args =[
        'build',
        'test',
      ];
    } else {
      args = this.usePrebuiltWDA ? [
        'test-without-building'
      ] : [
        'build-for-testing',
        'test-without-building'
      ];
    }

    // add the rest of the arguments for the xcodebuild command
    let genericArgs = [
      '-project', this.agentPath,
      '-scheme', 'WebDriverAgentRunner',
      '-destination', `id=${this.device.udid}`,
      '-configuration', 'Debug'
    ];
    args.push(...genericArgs);

    if (this.realDevice && this.xcodeConfigFile) {
      log.debug(`Using Xcode configuration file: '${this.xcodeConfigFile}'`);
      args.push('-xcconfig', this.xcodeConfigFile);
    }

    return {cmd, args};
  }

  async createXcodeBuildSubProcess () {
    if (this.realDevice) {
      if (this.keychainPath && this.keychainPassword) {
        await setRealDeviceSecurity(this.keychainPath, this.keychainPassword);
      }
      if (this.xcodeOrgId && this.xcodeSigningId && !this.xcodeConfigFile) {
        this.xcodeConfigFile = await generateXcodeConfigFile(this.xcodeOrgId, this.xcodeSigningId);
      }
    }
    let {cmd, args} = this.getXcodeBuildCommand();
    log.debug(`Beginning test with command '${cmd} ${args.join(' ')}' ` +
              `in directory '${this.bootstrapPath}'`);
    let xcodebuild = new SubProcess(cmd, args, {cwd: this.bootstrapPath});

    let logXcodeOutput = this.showXcodeLog;
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
      if (out.indexOf('Error Domain=') !== -1 && out.indexOf('Error writing attachment data to file') === -1) {
        logXcodeOutput = true;

        // terrible hack to handle case where xcode return 0 but is failing
        xcodebuild._wda_error_occurred = true;
      }

      if (logXcodeOutput) {
        for (let line of out.split('\n')) {
          xcodeLog.info(line);
        }
      }
    });

    return xcodebuild;
  }

  createiProxySubProcess (localport, deviceport) {
    log.debug(`Starting iproxy to forward traffic from local port ${localport} to device port ${deviceport} over USB`);
    return new SubProcess(`iproxy`, [localport, deviceport, this.device.udid]);
  }

  async startXcodebuild () {
    // wrap the start procedure in a promise so that we can catch, and report,
    // any startup errors that are thrown as events
    return await new B((resolve, reject) => {
      this.xcodebuild.on('exit', async (code, signal) => {
        log.info(`xcodebuild exited with code '${code}' and signal '${signal}'`);
        this.xcodebuild.processExited = true;
        if (this.xcodebuild._wda_error_occurred || (!signal && code !== 0)) {
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

          return reject(new Error(`xcodebuild failed with code ${code}`));
        }
      });

      return (async () => {
        try {
          let startTime = process.hrtime();
          await this.xcodebuild.start();
          await this.waitForStart(startTime);
          resolve();
        } catch (err) {
          let msg = `Unable to start WebDriverAgent: ${err}`;
          log.error(msg);
          reject(new Error(msg));
        }
      })();
    });
  }

  async waitForStart (startTime) {
    // try to connect once every 0.5 seconds, until `wdaLaunchTimeout` is up
    log.debug(`Waiting up to ${this.wdaLaunchTimeout}ms for WebDriverAgent to start`);
    try {
      let retries = parseInt(this.wdaLaunchTimeout / 500, 10);
      await retryInterval(retries, 500, async () => {
        if (this.xcodebuild.processExited) {
          // there has been an error elsewhere and we need to short-circuit
          return;
        }
        try {
          let opts = {
            method: 'GET',
            uri: `${this.url.href}status`,
            headers: 'Content-Type: application/json;charset=UTF-8, accept: application/json',
            forever: true,
            json: true,
          };
          let res = await request(opts);
          if (res.status !== 0) {
            throw new Error(`Received non-zero status code from WDA server: '${res.status}'`);
          }
          if (res.value && res.value.ios && res.value.ios.ip) {
            this.agentUrl = res.value.ios.ip;
            log.debug(`WebDriverAgent running on ip '${this.agentUrl}'`);
          }
        } catch (err) {
          throw new Error(`Unable to connect to running WebDriverAgent: ${err.message}`);
        }
      });

      if (this.xcodebuild.processExited) {
        // there has been an error elsewhere and we need to short-circuit
        return;
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
  }

  async startiproxy () {
    return await new B((resolve, reject) => {
      this.iproxy.on('exit', (code) => {
        log.debug(`iproxy exited with code '${code}'`);
        if (code) {
          return reject(new Error(`iproxy exited with code '${code}'`));
        }
      });
      this.iproxy.on('output', (stdout, stderr) => {
        // do nothing if we expect errors
        if (this.expectIProxyErrors) return;

        let out = stdout || stderr;
        for (let line of out.split('\n')) {
          if (!line.length) continue;

          if (line.indexOf('Resource temporarily unavailable') !== -1) {
            // this generally happens when WDA does not respond,
            // so print a more useful message
            log.debug('Connection to WDA timed out');
          } else {
            iproxyLog.debug(line);
          }
        }
      });

      return (async () => {
        try {
          await this.iproxy.start(IPROXY_TIMEOUT);
          resolve();
        } catch (err) {
          log.error(`Error starting iproxy: '${err.message}'`);
          reject(new Error('Unable to start iproxy. Is it installed?'));
        }
      })();
    });
  }

  async killHangingProcesses () {
    log.debug('Killing hanging processes');
    await killAppUsingAppName(this.device.udid, `xcodebuild`);
    let procNames = this.realDevice ? ['iproxy']
                                    : ['XCTRunner'];
    for (let proc of procNames) {
      await killAppUsingAppName(this.device.udid, proc);
    }
  }

  async quit () {
    log.info('Shutting down sub-processes');

    async function killProcess (name, proc) {
      if (proc && proc.proc) {
        log.info(`Shutting down ${name} process (pid ${proc.proc.pid})`);
        try {
          await proc.stop('SIGTERM', 1000);
        } catch (err) {
          if (err.message.indexOf(`Process didn't end after`) === -1) {
            throw err;
          }
          log.debug(`${name} process did not end in a timely fashion: '${err.message}'. ` +
                    `Sending 'SIGKILL'...`);
          try {
            await proc.stop('SIGKILL');
          } catch (err) {
            if (err.message.indexOf('not currently running') !== -1) {
              // the process ended but for some reason we were not informed
              return;
            }
            throw err;
          }
        }
      }
    }

    await killProcess('xcodebuild', this.xcodebuild);
    await killProcess('iproxy', this.iproxy);

    // if necessary, reset the bundleId to original value
    if (this.realDevice && this.updatedWDABundleId) {
      await resetProjectFile(this.agentPath, this.updatedWDABundleId);
    }

    if (this.jwproxy) {
      this.jwproxy.sessionId = null;
    }

    this.expectIProxyErrors = true;
  }

  get url () {
    if (!this._url) {
      if (this.realDevice && this.wdaLocalPort) {
        this._url = url.parse(`${WDA_BASE_URL}:${this.wdaLocalPort}`);
      } else {
        this._url = url.parse(`${WDA_BASE_URL}:${WDA_AGENT_PORT}`);
      }
    }
    return this._url;
  }

  set url (_url) {
    this._url = url.parse(_url);
  }

  get fullyStarted () {
    return !this.expectIProxyErrors;
  }

  set fullyStarted (started = false) {
    // before WDA is started we expect errors from iproxy, since it is not
    // communicating with anything yet
    this.expectIProxyErrors = !started;
  }
}

export default WebDriverAgent;
export { WebDriverAgent, WDA_BUNDLE_ID, BOOTSTRAP_PATH };
