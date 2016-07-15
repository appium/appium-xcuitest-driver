import { BaseDriver, isSessionCommand, errors } from 'appium-base-driver';
import { fs } from 'appium-support';
import _ from 'lodash';
import { launch } from 'node-simctl';
import { extractBundleId } from 'ios-app-utils';
import WebDriverAgent from './webdriveragent';
import log from './logger';
import { simBooted, createSim, getExistingSim } from './simulatorManagement.js';
import { killAllSimulators, simExists, getSimulator } from 'appium-ios-simulator';
import { retryInterval } from 'asyncbox';
import { SafariDriver } from 'appium-safari-driver';
import { desiredCapConstraints } from 'appium-ios-driver';
import commands from './commands/index.js';


const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const DEFAULT_SAFARI_URL = 'http://appium.io';

class XCUITestDriver extends BaseDriver {
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
    this.desiredCapConstraints = desiredCapConstraints;

    this.locatorStrategies = [
      'xpath',
      'id',
      'class name',
      '-ios predicate string',
      'accessibility id'
    ];
    this.webLocatorStrategies = [
      'link text',
      'css selector',
      'tag name',
      'partial link text'
    ];
  }

  get driverData () {
    // TODO fill out resource info here
    return {};
  }

  async getStatus () {
    let wdaStatus = await this.proxyCommand('/status', 'GET');
    return {wda: wdaStatus};
  }

  async getSafariDriver () {
    if (this._safariDriver) {
      return this._safariDriver;
    }

    log.info('Creating Safari Driver');
    let safariDriver = new SafariDriver();
    this.addManagedDriver(safariDriver);

    try {
      await safariDriver.createSession(this.opts);
    } catch (e) {
      log.warn('Safari Driver could not start a session, no webviews found');
      log.debug(e, e.message);
      return null;
    }

    // handle initial timeouts
    safariDriver.setImplicitWait(this.implicitWaitMs);
    safariDriver.setNewCommandTimeout(this.newCommandTimeoutMs);

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

      let { sim, udid, realDevice } = await this.determineDevice();
      log.info(`Determining device to run tests on: udid: '${udid}', real device: ${realDevice}`);
      this.sim = sim;
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
        log.info('Setting up simulator');
        await this.startSim();

      }

      if (this.isSafari()) {
        let initialUrl = this.opts.initialUrl ? this.opts.initialUrl : DEFAULT_SAFARI_URL;
        this.opts.processArguments = { args: ["-u", initialUrl] };
      }

      this.wda = new WebDriverAgent({
        sim: this.sim, //TODO can't be a sim if real device. find a different way to supply logs to webdriveragent
        platformVersion: this.opts.platformVersion,
        host: this.opts.address,
        agentPath: this.opts.agentPath
      });

      await this.wda.launch(sessionId);

      this.proxyReqRes = this.wda.proxyReqRes.bind(this.wda);
      // if we keep proxy active then all call will route to proxy
      if (!this.isSafari()) {
        this.jwpProxyActive = true;
      }

      await this.startWdaSession(this.opts.app, this.opts.bundleId, this.opts.processArguments);

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

    if (this._safariDriver) {
      log.debug('In a Safari session. Sending delete command to Safari driver');
      await this._safariDriver.deleteSession();
    }

    // TODO: this kills all simulators, so needs to be changed if running multiple sims
    if (!noReset && !!this.sim) {
      log.debug('Resetting simulator');
      if (this.lifecycleData.bootSim) {
        log.debug('Shutting down simulator');
        await this.sim.shutdown();
      }
      if (this.lifecycleData.createSim) {
        log.debug('Deleting simulator created for this run');
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

  async determineDevice () {
    let realDevice, udid;
    let sim;
    if (this.opts.udid) {
      if (await simExists(this.opts.udid)) {
        this.lifecycleData.createSim = false;
        udid = this.opts.udid;
        sim = await getSimulator(udid);
        realDevice = false;
      } else {
        //TODO check for real device
        throw new errors.SessionNotCreatedError(`no simulator found with udid ${this.opts.udid}`);
      }
    } else {
      sim = await getExistingSim(this.opts.deviceName, this.opts.platformVersion);
      if (sim) {
        if (this.opts.reset || this.opts.fullReset) {
          await sim.clean();
          await sim.shutdown();
        }
        this.lifecycleData.createSim = false;
        udid = sim.udid;
        realDevice = false;
      } else {
        // no udid: create a new sim
        log.info(`udid not provided, using desired caps to create a new sim`);
        sim = await this.createSim();
        udid = sim.udid;
        realDevice = false;
      }
    }

    return { sim, udid, realDevice };
  }

  async startSim () {
    // TODO for now just kill all sims unless specified udid is booted.
    // if booted, use it. if not booted, start it up
    // if no udid, well lets see if we can start one up based on desired caps
    // if we support multiple sims we need to change this

    if (!await simBooted(this.sim)) {
      log.info(`Simulator with udid '${this.opts.udid}' not booted. Booting up now`);
      await killAllSimulators();
      await this.sim.run();
      this.lifecycleData.bootSim = true;
    } else {
      log.info(`Simulator with udid '${this.opts.udid}' already booted`);
      this.lifecycleData.bootSim = false;
    }
  }

  async createSim () {
    this.lifecycleData.createSim = true;

    // create sim for caps
    let sim = await createSim(this.caps, this.sessionId);
    log.info(`Created simulator with udid '${sim.udid}'.`);

    return sim;
  }

  async launchApp () {
    const APP_LAUNCH_TIMEOUT = 20 * 1000;

    await launch(this.sim.udid, this.opts.bundleId);

    let checkStatus = async () => {
      let response = await this.proxyCommand('/status', 'GET');
      let currentApp = response.currentApp.bundleID;
      if (currentApp !== this.opts.bundleId) {
        throw new Error(`${this.opts.bundleId} not in foreground. ${currentApp} is in foreground`);
      }
    };

    log.info(`Waiting for '${this.opts.bundleId}' to be in foreground`);
    let retries = parseInt(APP_LAUNCH_TIMEOUT / 200, 10);
    await retryInterval(retries, 200, checkStatus);
    log.info(`${this.opts.bundleId} is in foreground`);
  }

  async startWdaSession (app, bundleId, processArguments) {
    let args = processArguments ? processArguments.args : [];
    let env = processArguments ? processArguments.env : {};

    let desired = {
      desiredCapabilities: {app, bundleId, arguments : args, environment: env, shouldWaitForQuiescence: true}
    };

    await this.proxyCommand('/session', 'POST', desired);
  }

  shouldProxyToSafari (command) {
    let commandsToNotProxyToSafari = [
      'getContexts',
      'setContext',
      'getCurrentContext',
      'getScreenshot',
      'deleteSession'
    ];

    return this.inWebview() &&
           isSessionCommand(command) &&
           !_.includes(commandsToNotProxyToSafari, command);
  }

  async executeCommand (cmd, ...args) {
    if (this.shouldProxyToSafari(cmd)) {
      let safariDriver = await this.getSafariDriver();
      return await safariDriver.executeCommand(cmd, ...args);
    }
    return await super.executeCommand(cmd, ...args);
  }

  // Override Proxy methods from BaseDriver
  proxyActive () {
    return this.jwpProxyActive;
  }

  getProxyAvoidList () {
    return [
      ['GET', /context/],
      ['POST', /context/],
      ['POST', /execute/],
      ['POST', /element$/],
      ['POST', /elements$/],
      ['POST', /timeouts/],
      ['GET', /alert_text/],
      ['POST', /accept_alert/],
      ['POST', /dismiss_alert/],
      ['GET', /source/],
      ['POST', /appium/],
      ['GET', /appium/],
      ['POST', /touch/],
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


  /*
   * override these timeout methods so we can make sure the safari driver
   * gets them too. put them here because `super` is awful and can't be used
   * outside of the class definition
   */
  async timeouts (type, duration) {
    await super.timeouts(type, duration);
    if (this._safariDriver) {
      this._safariDriver.timeouts(type, duration);
    }
  }

  async implicitWait (ms) {
    await super.implicitWait(ms);
    if (this._safariDriver) {
      await this._safariDriver.implicitWait(ms);
    }
  }

  newCommandTimeout (ms) {
    super.newCommandTimeout(ms);
    if (this._safariDriver) {
      this._safariDriver.newCommandTimeout(ms);
    }
  }

  clearNewCommandTimeout () {
    super.clearNewCommandTimeout();
    if (this._safariDriver) {
      this._safariDriver.clearNewCommandTimeout();
    }
  }

  validateDesiredCaps (caps) {
    // check with the base class, and return if it fails
    let res = super.validateDesiredCaps(caps);
    if (!res) return res;

    // make sure that the capabilities have one of `app` or `bundleId`
    if ((caps.browserName || '').toLowerCase() !== 'safari' &&
        !caps.app && ! caps.bundleId) {
      let msg = 'The desired capabilities must include either an app or a bundleId for iOS';
      log.errorAndThrow(msg);
    }

    let verifyProcessArgument = (processArguments) => {
      if (!_.isNil(processArguments.args) && !_.isArray(processArguments.args)) {
        log.errorAndThrow('processArguments.args must be an array of string');
      }

      if (!_.isNil(processArguments.env) && !_.isObject(caps.processArguments.env)) {
        log.errorAndThrow('processArguments.env must be an object <key,value> pair {a:b, c:d}');
      }
    };

    // `processArguments` should be JSON string or an object with arguments and/ environment details
    if (caps.processArguments) {
      if (_.isString(caps.processArguments)) {
        try {
          // try to parse the string as JSON
          caps.processArguments = JSON.parse(caps.processArguments);
          verifyProcessArgument(caps.processArguments);
        } catch (err) {
          log.errorAndThrow(`processArguments must be a json format or an object with format {arguments : [], environment : {a:b, c:d}}. Both environment and argument can be null. Error : ${err}`);
        }
      } else if (_.isObject(caps.processArguments)) {
        verifyProcessArgument(caps.processArguments);
      } else {
        log.errorAndThrow('processArguments must be an object, or a string JSON object with format {arguments : [], environment : {a:b, c:d}}. Both environment and argument can be null.');
      }
    }

    // finally, return true since the superclass check passed, as did this
    return true;
  }
}

for (let [cmd, fn] of _.toPairs(commands)) {
  XCUITestDriver.prototype[cmd] = fn;
}

export default XCUITestDriver;
export { XCUITestDriver };
