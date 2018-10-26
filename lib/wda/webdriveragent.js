import _ from 'lodash';
import path from 'path';
import url from 'url';
import { JWProxy } from 'appium-base-driver';
import { fs, util } from 'appium-support';
import log from '../logger';
import { NoSessionProxy } from "./no-session-proxy";
import { checkForDependencies, WDA_RUNNER_BUNDLE_ID, getWDAUpgradeTimestamp } from './utils';
import { resetXCTestProcesses, getPIDsListeningOnPort } from '../utils';
import XcodeBuild from './xcodebuild';
import iProxy from './iproxy';
import { exec } from 'teen_process';


const BOOTSTRAP_PATH = path.resolve(__dirname, '..', '..', '..', 'WebDriverAgent');
const WDA_BUNDLE_ID = 'com.apple.test.WebDriverAgentRunner-Runner';
const WDA_LAUNCH_TIMEOUT = 60 * 1000;
const WDA_AGENT_PORT = 8100;
const WDA_BASE_URL = 'http://localhost';


class WebDriverAgent {
  constructor (xcodeVersion, args = {}) {
    this.xcodeVersion = xcodeVersion;

    this.args = _.clone(args);

    this.device = args.device;
    this.platformVersion = args.platformVersion;
    this.host = args.host;
    this.realDevice = !!args.realDevice;

    this.setWDAPaths(args.bootstrapPath, args.agentPath);

    this.wdaLocalPort = args.wdaLocalPort;

    this.prebuildWDA = args.prebuildWDA;

    this.webDriverAgentUrl = args.webDriverAgentUrl;

    this.started = false;

    this.wdaConnectionTimeout = args.wdaConnectionTimeout;

    this.useCarthageSsl = _.isBoolean(args.useCarthageSsl) && args.useCarthageSsl;

    this.useXctestrunFile = args.useXctestrunFile;

    this.xcodebuild = new XcodeBuild(this.xcodeVersion, this.device, {
      platformVersion: this.platformVersion,
      agentPath: this.agentPath,
      bootstrapPath: this.bootstrapPath,
      realDevice: this.realDevice,
      showXcodeLog: !!args.showXcodeLog,
      xcodeConfigFile: args.xcodeConfigFile,
      xcodeOrgId: args.xcodeOrgId,
      xcodeSigningId: args.xcodeSigningId,
      keychainPath: args.keychainPath,
      keychainPassword: args.keychainPassword,
      useSimpleBuildTest: args.useSimpleBuildTest,
      usePrebuiltWDA: args.usePrebuiltWDA,
      updatedWDABundleId: args.updatedWDABundleId,
      launchTimeout: args.wdaLaunchTimeout || WDA_LAUNCH_TIMEOUT,
      wdaRemotePort: this.realDevice ? WDA_AGENT_PORT : (this.wdaLocalPort || WDA_AGENT_PORT),
      useXctestrunFile: this.useXctestrunFile,
      derivedDataPath: args.derivedDataPath,
      mjpegServerPort: args.mjpegServerPort,
    });
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

  async cleanupObsoleteProcesses () {
    const pids = await getPIDsListeningOnPort(this.url.port,
      (cmdLine) => (cmdLine.includes('/WebDriverAgentRunner') || cmdLine.includes('/iproxy')) &&
        !cmdLine.toLowerCase().includes(this.device.udid.toLowerCase()));
    if (!pids.length) {
      log.debug(`No obsolete cached processes from previous WDA sessions ` +
                `listening on port ${this.url.port} have been found`);
      return;
    }

    log.info(`Detected ${pids.length} obsolete cached process${pids.length === 1 ? '' : 'es'} ` +
             `from previous WDA sessions. Cleaning up...`);
    try {
      await exec('kill', pids);
    } catch (e) {
      log.warn(`Failed to kill obsolete cached process${pids.length === 1 ? '' : 'es'} '${pids}'. ` +
               `Original error: ${e.message}`);
    }
  }

  /**
   * Return boolean if WDA is running or not
   * @return {boolean} True if WDA is running
   * @throws {Error} If there was invalid response code or body
   */
  async isRunning () {
    return !!(await this.getStatus());
  }

  /**
   * Return current running WDA's status like below
   * {
   *   "state": "success",
   *   "os": {
   *     "name": "iOS",
   *     "version": "11.4",
   *     "sdkVersion": "11.3"
   *   },
   *   "ios": {
   *     "simulatorVersion": "11.4",
   *     "ip": "172.254.99.34"
   *   },
   *   "build": {
   *     "time": "Jun 24 2018 17:08:21",
   *     "productBundleIdentifier": "com.facebook.WebDriverAgentRunner"
   *   }
   * }
   *
   * @return {?object} State Object
   * @throws {Error} If there was invalid response code or body
   */
  async getStatus () {
    const noSessionProxy = new NoSessionProxy({
      server: this.url.hostname,
      port: this.url.port,
      base: '',
      timeout: 3000,
    });
    try {
      return await noSessionProxy.command('/status', 'GET');
    } catch (err) {
      log.debug(`WDA is not listening at '${this.url.href}'`);
      return null;
    }
  }

  async uninstall () {
    log.debug(`Removing WDA application from device`);
    try {
      await this.device.removeApp(WDA_BUNDLE_ID);
    } catch (e) {
      log.warn(`WebDriverAgent uninstall failed. Perhaps, it is already uninstalled? Original error: ${JSON.stringify(e)}`);
    }
  }

  async launch (sessionId) {
    if (this.webDriverAgentUrl) {
      log.info(`Using provided WebdriverAgent at '${this.webDriverAgentUrl}'`);
      this.url = this.webDriverAgentUrl;
      this.setupProxies(sessionId);
      return;
    }

    log.info('Launching WebDriverAgent on the device');

    this.setupProxies(sessionId);

    if (!this.useXctestrunFile && !await fs.exists(this.agentPath)) {
      throw new Error(`Trying to use WebDriverAgent project at '${this.agentPath}' but the ` +
                      'file does not exist');
    }

    if (!this.useXctestrunFile) {
      // make sure that the WDA dependencies have been built
      const didPerformUpgrade = await checkForDependencies(this.bootstrapPath, this.useCarthageSsl);
      if (didPerformUpgrade) {
        // Only perform the cleanup after WDA upgrade
        await this.xcodebuild.cleanProject();
      }
    }
    // We need to provide WDA local port, because it might be occupied with
    // iproxy instance initiated by some preceeding run with a real device
    // (iproxy instances are not killed on session termination by default)
    await resetXCTestProcesses(this.device.udid, !this.realDevice, {wdaLocalPort: this.url.port});

    if (this.realDevice) {
      this.iproxy = new iProxy(this.device.udid, this.url.port, WDA_AGENT_PORT);
      await this.iproxy.start();
    }

    await this.xcodebuild.init(this.noSessionProxy);

    // Start the xcodebuild process
    if (this.prebuildWDA) {
      await this.xcodebuild.prebuild();
    }
    return await this.xcodebuild.start();
  }

  setupProxies (sessionId) {
    const proxyOpts = {
      server: this.url.hostname,
      port: this.url.port,
      base: '',
      timeout: this.wdaConnectionTimeout,
    };

    this.jwproxy = new JWProxy(proxyOpts);
    this.jwproxy.sessionId = sessionId;
    this.proxyReqRes = this.jwproxy.proxyReqRes.bind(this.jwproxy);

    this.noSessionProxy = new NoSessionProxy(proxyOpts);
    this.noSessionProxyReqRes = this.noSessionProxy.proxyReqRes.bind(this.noSessionProxy);
  }

  async quit () {
    log.info('Shutting down sub-processes');

    if (this.iproxy) {
      await this.iproxy.quit();
    }

    await this.xcodebuild.quit();
    await this.xcodebuild.reset();

    if (this.jwproxy) {
      this.jwproxy.sessionId = null;
    }

    this.started = false;

    if (!this.args.webDriverAgentUrl) {
      // if we populated the url ourselves (during `setupCaching` call, for instance)
      // then clean that up. If the url was supplied, we want to keep it
      this.webDriverAgentUrl = null;
    }
  }

  get url () {
    if (!this._url) {
      let port = this.wdaLocalPort || WDA_AGENT_PORT;
      this._url = url.parse(`${WDA_BASE_URL}:${port}`);
    }
    return this._url;
  }

  set url (_url) {
    this._url = url.parse(_url);
  }

  get fullyStarted () {
    return this.started;
  }

  set fullyStarted (started = false) {
    // before WDA is started we expect errors from iproxy, since it is not
    // communicating with anything yet
    this.started = started;
    if (this.iproxy) {
      this.iproxy.expectIProxyErrors = !started;
    }
  }

  async retrieveDerivedDataPath () {
    return await this.xcodebuild.retrieveDerivedDataPath();
  }

  /**
   * Reuse running WDA if it has the same bundle id with updatedWDABundleId.
   * Or reuse it if it has the default id without updatedWDABundleId.
   * Uninstall it if the method faces an exception for the above situation.
   *
   * @param {string} updatedWDABundleId BundleId you'd like to use
   */
  async setupCaching (updatedWDABundleId) {
    const status = await this.getStatus();
    if (!status || !status.build) {
      log.debug('WDA is currently not running. There is nothing to cache');
      return;
    }

    const {
      productBundleIdentifier,
      upgradedAt,
    } = status.build;
    if (util.hasValue(productBundleIdentifier) && util.hasValue(updatedWDABundleId) && updatedWDABundleId !== productBundleIdentifier) {
      log.info(`Will uninstall running WDA since it has different bundle id. The actual value is '${productBundleIdentifier}'.`);
      return await this.uninstall();
    }
    if (util.hasValue(productBundleIdentifier) && !util.hasValue(updatedWDABundleId) && WDA_RUNNER_BUNDLE_ID !== productBundleIdentifier) {
      log.info(`Will uninstall running WDA since its bundle id is not equal to the default value ${WDA_RUNNER_BUNDLE_ID}`);
      return await this.uninstall();
    }

    const actualUpgradeTimestamp = await getWDAUpgradeTimestamp(this.bootstrapPath);
    log.debug(`Upgrade timestamp of the currently bundled WDA: ${actualUpgradeTimestamp}`);
    log.debug(`Upgrade timestamp of the WDA on the device: ${upgradedAt}`);
    if (actualUpgradeTimestamp && upgradedAt && _.toLower(`${actualUpgradeTimestamp}`) !== _.toLower(`${upgradedAt}`)) {
      log.info('Will uninstall running WDA since it has different version in comparison to the one ' +
        `which is bundled with appium-xcuitest-driver module (${actualUpgradeTimestamp} != ${upgradedAt})`);
      return await this.uninstall();
    }

    const message = util.hasValue(productBundleIdentifier)
      ? `Will reuse previously cached WDA instance at '${this.url.href}' with '${productBundleIdentifier}'`
      : `Will reuse previously cached WDA instance at '${this.url.href}'`;
    log.info(`${message}. Set the wdaLocalPort capability to a value different from ${this.url.port} if this is an undesired behavior.`);
    this.webDriverAgentUrl = this.url.href;
  }

  async quitAndUninstall () {
    await this.quit();
    await this.uninstall();
  }
}

export default WebDriverAgent;
export { WebDriverAgent, WDA_BUNDLE_ID, BOOTSTRAP_PATH };
