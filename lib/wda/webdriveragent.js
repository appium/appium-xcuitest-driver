import _ from 'lodash';
import path from 'path';
import url from 'url';
import { JWProxy } from 'appium-base-driver';
import { fs } from 'appium-support';
import log from '../logger';
import { NoSessionProxy } from "./no-session-proxy";
import { checkForDependencies } from './utils';
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
      useXctestrunFile: this.useXctestrunFile
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

  async isRunning () {
    const noSessionProxy = new NoSessionProxy({
      server: this.url.hostname,
      port: this.url.port,
      base: '',
      timeout: 3000,
    });
    try {
      const status = await noSessionProxy.command('/status', 'GET');
      if (!status) {
        throw new Error(`WDA response to /status command should be defined.`);
      }
      return true;
    } catch (err) {
      log.debug(`WDA is not listening at '${this.url.href}'`);
      return false;
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
      await checkForDependencies(this.bootstrapPath, this.useCarthageSsl);
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
}

export default WebDriverAgent;
export { WebDriverAgent, WDA_BUNDLE_ID, BOOTSTRAP_PATH };
