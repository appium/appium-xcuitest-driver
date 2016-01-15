import { BaseDriver } from 'appium-base-driver';
import { fs } from 'appium-support';
import _ from 'lodash';
import { launch } from 'node-simctl';
import { extractBundleId } from 'ios-app-utils';
import WebDriverAgent from './webdriveragent';
import log from './logger';
import { simBooted, createSim, launchSafariOnSim } from './simulatorManagement.js';
import { killAllSimulators, getSimulator, simExists } from 'appium-ios-simulator';
import { retryInterval } from 'asyncbox';
import { errors, isSessionCommand } from 'mobile-json-wire-protocol';
import { SafariDriver } from 'appium-safari-driver';
import commands from './commands/index.js';

const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';

class WebDriverAgentDriver extends BaseDriver {
  constructor (opts = {}, shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);

    // TODO set up desired cap constraints
    //this.desiredCapConstraints = desiredCapConstraints;
    this.wda = null;
    this.sim = null;
    this.jwpProxyActive = false;
    this.proxyReqRes = null;
    this.jwpProxyAvoid = [];
    this._safariDriver = null; // lazy-loaded in getter
  }

  get driverData () {
    // TODO fill out resource info here
    return {};
  }

  async getSafariDriver () {
    if (this._safariDriver) {
      return this._safariDriver;
    }

    log.info('Creating Safari Driver');
    let safariDriver = new SafariDriver();

    try {
      await safariDriver.createSession(this.opts);
    } catch (e) {
      log.warn('Safari Driver could not start a session, no webviews found');
      log.debug(e, e.message);
      return null;
    }
    log.info('Safari Driver connected');
    this._safariDriver = safariDriver;
    return safariDriver;
  }

  async createSession (caps) {
    this.lifecycleData = {}; // this is used for keeping track of the state we start so when we delete the session we can put things back
    try {
      // TODO add validation on caps
      // TODO handle otherSessionData for multiple sessions
      let sessionId;
      [sessionId] = await super.createSession(caps);

      log.info('Determining device to run tests on');
      let { udid, realDevice } = await this.determineDevice();
      this.opts.udid = udid;
      this.opts.isRealDevice = realDevice;

      if (this.opts.browserName) {
        log.info('safari test requested');
        this.safari = true;
        this.opts.bundleId = SAFARI_BUNDLE_ID;
        if (this.opts.isRealDevice) {
          throw new Error('real device safari support not yet implemented. Contact an appium dev');
        }
      }

      // fail very early if the app doesn't actually exist
      if (this.opts.app) {
        await this.checkAppPresent();
      }

      if (!this.opts.bundleId) {
        this.opts.bundleId = await extractBundleId(this.opts.app);
      }

      if (!this.opts.isRealDevice) {
        log.info('setting up simulator');
        this.sim = await this.startSim();
      }

      if (this.isSafari() && this.isSimulator()) {
        await launchSafariOnSim(this.opts.safariInitialUrl, this.sim);
        return [sessionId, caps];
      }

      this.wda = new WebDriverAgent({
        sim: this.sim, //TODO can't be a sim if real device. find a different way to supply logs to webdriveragent
        platformVersion: this.opts.platformVersion,
        host: this.opts.host,
        agentPath: this.opts.agentPath
      });

      await this.wda.launch(sessionId);

      this.proxyReqRes = this.wda.proxyReqRes.bind(this.wda);
      this.jwpProxyActive = true;

      await this.startWdaSession(this.opts.app, this.opts.bundleId);

      return [sessionId, caps];
    } catch (e) {
      log.error(e);
      await this.deleteSession();
      throw e;
    }
  }

  async deleteSession () {
    this.jwpProxyActive = false;
    this.proxyReqRes = null;

    let noReset = this.opts.noReset;

    if (this.wda) {
      await this.wda.quit();
    }
    // TODO: this kills all simulators, so needs to be changed if running multiple sims
    if (!noReset && this.sim) {
      if (this.lifecycleData.bootSim) {
        await this.sim.shutdown();
      }
      if (this.lifecycleData.createSim) {
        await this.sim.delete();
      }
    }

    await super.deleteSession();
  }

  async checkAppPresent () {
    log.debug("Checking whether app is actually present");
    if (!(await fs.exists(this.opts.app))) {
      log.errorAndThrow(`Could not find app at ${this.opts.app}`);
    }
  }

  async determineDevice() {
    let realDevice, udid;

    if (this.opts.udid) {
      if (await simExists(this.opts.udid)) {
        this.lifecycleData.createSim = false;
        udid = this.opts.udid;
        realDevice = false;
      } else {
          //TODO check for real device
          throw new errors.SessionNotCreatedError(`no simulator found with udid ${this.opts.udid}`);
      }
    } else {
      // no udid: create a new sim
      log.info(`udid not provided, using desired caps to create a new sim`);
      let sim = await this.createSim();
      udid = sim.udid;
      realDevice = false;
    }

    return { udid, realDevice };
  }

  async startSim () {
    let sim;
    // TODO for now just kill all sims unless specified udid is booted.
    // if booted, use it. if not booted, start it up
    // if no udid, well lets see if we can start one up based on desired caps
    // if we support multiple sims we need to change this

    sim = await getSimulator(this.opts.udid);
    if (!await simBooted(this.opts.udid)) {
      log.info(`simulator with udid ${this.opts.udid} not booted. Booting up now`);
      await killAllSimulators();
      await sim.run();
      this.lifecycleData.bootSim = true;
    } else {
      log.info(`simulator ${this.opts.udid} already booted`);
      this.lifecycleData.bootSim = false;
    }
    return sim;
  }

  async createSim () {

    this.lifecycleData.createSim = true;

    // create sim for caps
    let sim = await createSim(this.caps, this.sessionId);
    log.info(`created simulator ${sim.udid}. Booting it up`);

    return sim;
  }

  async launchApp () {
    const APP_LAUNCH_TIMEOUT = 20 * 1000;

    await launch(this.sim.udid, this.opts.bundleId);

    let checkStatus = async () => {
      let response = await this.wda.jwproxy.command('/status', 'GET');
      let currentApp = response.currentApp.bundleID;
      if (currentApp !== this.opts.bundleId) {
        throw new Error(`${this.opts.bundleId} not in foreground. ${currentApp} is in foreground`);
      }
    };

    log.info(`waiting for ${this.opts.bundleId} to be in foreground`);
    await retryInterval(APP_LAUNCH_TIMEOUT / 200, 200, checkStatus);
    log.info(`${this.opts.bundleId} is in foreground`);
  }

  async startWdaSession(appPath, bundleId) {
    let desired = {
      desiredCapabilities: {
        app: appPath,
        bundleId: bundleId
      }
    };
    await this.wda.jwproxy.command('/session', 'POST', desired);
  }

  shouldProxyToSafari (command) {
    let commandsToNotProxyToSafari = [
      'getContexts',
      'setContext',
      'getCurrentContext',
      'deleteSession'
    ];

    return this.inWebview() &&
           isSessionCommand(command) &&
           !_.includes(commandsToNotProxyToSafari, command);
  }

  async executeCommand (cmd) {
    if (this.shouldProxyToSafari(cmd)) {
      let safariDriver = await this.getSafariDriver();
      return await safariDriver.executeCommand(...arguments);
    }

    return await super.executeCommand(...arguments);
  }

  // Override Proxy methods from BaseDriver
  proxyActive () {
    return this.jwpProxyActive;
  }

  getProxyAvoidList () {
    return [
      ['GET', /context/],
      ['POST', /context/]
    ];
  }

  canProxy () {
    return true;
  }

  isSafari () {
    return this.safari;
  }

  isRealDevice () {
    return this.opts.realDevice;
  }

  isSimulator () {
    return !this.opts.realDevice;
  }

  inWebview () {
    return this.isSafari() || this.webview;
  }

}

for (let [cmd, fn] of _.toPairs(commands)) {
  WebDriverAgentDriver.prototype[cmd] = fn;
}

export { WebDriverAgentDriver };
