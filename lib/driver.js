import { BaseDriver } from 'appium-base-driver';
import { fs } from 'appium-support';
import _ from 'lodash';
import { launch, installApp, removeApp } from 'node-simctl';
import { extractBundleId } from 'ios-app-utils';
import WebDriverAgent from './webdriveragent';
import log from './logger';
import { simBooted, createSim, getExistingSim } from './simulator-management';
import { killAllSimulators, simExists, getSimulator } from 'appium-ios-simulator';
import { retryInterval } from 'asyncbox';
import { settings as iosSettings, defaultServerCaps } from 'appium-ios-driver';
import desiredCapConstraints from './desired-caps';
import commands from './commands/index';
import { detectUdid, getAndCheckXcodeVersion, getAndCheckIosSdkVersion } from './utils';
import { getConnectedDevices } from './real-device-management';
import IOSDeploy from './ios-deploy';

const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const SAFARI_LAUNCHER_BUNDLE = 'com.bytearc.SafariLauncher';

const NO_PROXY_NATIVE_LIST = [
  ['GET', /context/],
  ['POST', /context/],
  ['GET', /window/],
  ['POST', /window/],
  ['DELETE', /window/],
  ['POST', /execute/],
  ['POST', /element$/],
  ['POST', /elements$/],
  ['POST', /timeouts/],
  ['GET', /alert_text/],
  ['POST', /alert_text/],
  ['POST', /accept_alert/],
  ['POST', /dismiss_alert/],
  ['GET', /source/],
  ['POST', /appium/],
  ['GET', /appium/],
  ['POST', /touch/],
  ['POST', /click/],
  ['GET', /log/],
  ['POST', /log/],
  ['POST', /moveto/],
  ['POST', /receive_async_response/], // always, in case context switches while waiting
  ['GET', /location/],
  ['GET', /size/],
  ['POST', /value/],
];
const NO_PROXY_WEB_LIST = [
  ['GET', /title/],
  ['GET', /url/],
  ['POST', /url/],
  ['POST', /element/],
  ['POST', /back/],
  ['POST', /forward/],
  ['GET', /attribute/],
  ['GET', /text/],
  ['POST', /clear/],
  ['GET', /element/],
  ['POST', /click/],
  ['POST', /refresh/],
  ['GET', /cookie/],
  ['POST', /cookie/],
  ['DELETE', /cookie/],
  ['POST', /frame/],
].concat(NO_PROXY_NATIVE_LIST);

class XCUITestDriver extends BaseDriver {
  constructor (opts = {}, shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);

    this.desiredCapConstraints = desiredCapConstraints;

    this.locatorStrategies = [
      'xpath',
      'id',
      'name',
      'class name',
      '-ios predicate string',
      'accessibility id'
    ];
    this.webLocatorStrategies = [
      'link text',
      'css selector',
      'tag name',
      'link text',
      'partial link text'
    ];

    this.resetIos();
  }

  resetIos () {
    this.opts = {};
    this.wda = null;
    this.opts.device = null;
    this.jwpProxyActive = false;
    this.proxyReqRes = null;
    this.jwpProxyAvoid = [];
    this.safari = false;

    // some things that commands imported from appium-ios-driver need
    this.curWebFrames = [];
    this.webElementIds = [];
    this._currentUrl = null;
    this.curContext = null;
    this.xcodeVersion = null;
    this.iosSdkVersion = null;
    this.contexts = [];
    this.implicitWaitMs = 0;
    this.asynclibWaitMs = 0;
    this.pageLoadMs = 6000;
  }

  get driverData () {
    // TODO fill out resource info here
    return {};
  }

  async getStatus () {
    let wdaStatus = await this.proxyCommand('/status', 'GET');
    return {wda: wdaStatus};
  }

  async createSession (caps) {
    this.lifecycleData = {}; // this is used for keeping track of the state we start so when we delete the session we can put things back
    try {
      // TODO add validation on caps
      // TODO handle otherSessionData for multiple sessions
      let [sessionId] = await super.createSession(caps);
      this.opts.sessionId = sessionId;

      await this.start();

      // merge server capabilities + desired capabilities
      caps = Object.assign({}, defaultServerCaps, caps);
      return [sessionId, caps];
    } catch (e) {
      log.error(e);
      await this.deleteSession();
      throw e;
    }
  }

  async start () {
    if (!this.xcodeVersion) {
      this.xcodeVersion = await getAndCheckXcodeVersion();
      log.debug(`Xcode version set to '${this.xcodeVersion.versionString}'`);
    }

    this.iosSdkVersion = await getAndCheckIosSdkVersion();
    log.debug(`iOS SDK Version set to '${this.iosSdkVersion}'`);

    if (this.opts.platformVersion && parseFloat(this.opts.platformVersion) < 9.3) {
      throw Error(`Platform version must be 9.3 or above. '${this.opts.platformVersion}' is not supported.`);
    }

    let { device, udid, realDevice } = await this.determineDevice();
    log.info(`Determining device to run tests on: udid: '${udid}', real device: ${realDevice}`);
    this.opts.device = device;
    this.opts.udid = udid;
    this.opts.realDevice = realDevice;

    // at this point if there is no platformVersion, get it from the device
    if (!this.opts.platformVersion) {
      if (this.opts.device && _.isFunction(this.opts.device.getPlatformVersion)) {
        this.opts.platformVersion = await this.opts.device.getPlatformVersion();
        log.info(`No platformVersion specified. Using device version: '${this.opts.platformVersion}'`);
      } else {
        // TODO: this is when it is a real device. when we have a real object wire it in
      }
    }

    if (this.opts.browserName) {
      log.info('Safari test requested');
      this.safari = true;      
      this.opts.app = undefined;
      this.opts.processArguments = this.opts.processArguments || {};
      if (this.isRealDevice()) {
        this.opts.bundleId = SAFARI_LAUNCHER_BUNDLE;
        this._currentUrl = this.opts.safariInitialUrl || `http://appium.io`;
        this.opts.processArguments.args = [this._currentUrl];
      } else {
        this.opts.bundleId = SAFARI_BUNDLE_ID;
        this._currentUrl = this.opts.safariInitialUrl || `http://${this.opts.address}:${this.opts.port}/welcome`;
        this.opts.processArguments.args = ['-u', this._currentUrl];
      }
    } else {
      await this.configureApp();
    }

    // fail very early if the app doesn't actually exist
    if (this.opts.app) {
      await this.checkAppPresent();
    }

    if (!this.opts.bundleId) {
      this.opts.bundleId = await this.extractBundleId(this.opts.app);
    }

    // handle logging
    this.logs = {};
    await this.startLogCapture();

    log.info(`Setting up ${this.isRealDevice() ? 'real device' : 'simulator'}`);
    if (!this.isRealDevice()) {
      this.localeConfig = await iosSettings.setLocale(this.opts.device, this.opts, {}, this.isSafari());
      await iosSettings.setPreferences(this.opts.device, this.opts, this.isSafari());
      await this.startSim();
    }

    await this.installApp();

    await this.startWda(this.opts.sessionId, realDevice);

    await this.setInitialOrientation(this.opts.orientation);

    if (this.isSafari()) {
      log.debug('Waiting for initial webview');
      await this.navToInitialWebview();
    }
  }

  async startWda (sessionId, realDevice) {
    this.wda = new WebDriverAgent(this.opts);

    try {
      await this.wda.launch(sessionId, realDevice);
    } catch (err) {
      if (err.message.indexOf('xcodebuild failed with code 65') === -1) {
        throw err;
      }
      // Xcode error code 65 means that the WDA app is still being installed
      // and xcodebuild can't do its business, so it is reasonable to retry
      log.debug('xcodebuild failure warrants retry. Retrying...');
      await this.wda.quit();
      await this.wda.launch(sessionId, realDevice);
    }

    this.proxyReqRes = this.wda.proxyReqRes.bind(this.wda);
    this.jwpProxyActive = true;

    await this.startWdaSession(this.opts.bundleId, this.opts.processArguments);
  }

  // create an alias so we can actually unit test createSession by stubbing
  // this
  async extractBundleId (app) {
    return await extractBundleId(app);
  }

  async deleteSession () {
    await this.stop();

    await super.deleteSession();
  }

  async stop () {
    this.jwpProxyActive = false;
    this.proxyReqRes = null;

    let noReset = this.opts.noReset;

    if (this.wda) {
      await this.wda.quit();
    }

    if (this.isWebContext()) {
      log.debug('In a web session. Removing remote debugger');
      await this.stopRemote();
    }

    // TODO: this kills all simulators, so needs to be changed if running multiple sims
    if (!noReset && !!this.opts.device) {
      log.debug('Resetting simulator');
      if (this.lifecycleData.bootSim) {
        log.debug('Shutting down simulator');
        await this.opts.device.shutdown();
      }
      if (this.lifecycleData.createSim) {
        log.debug('Deleting simulator created for this run');
        await this.opts.device.delete();
      }
    }

    if (!_.isEmpty(this.logs)) {
      this.logs.syslog.stopCapture();
      this.logs = {};
    }

    this.resetIos();
  }

  async executeCommand (cmd, ...args) {
    log.debug(`Executing command '${cmd}'`);
    if (cmd === 'receiveAsyncResponse') {
      return await this.receiveAsyncResponse(...args);
    }
    return await super.executeCommand(cmd, ...args);
  }


  async checkAppPresent () {
    log.debug("Checking whether app is actually present");
    if (!(await fs.exists(this.opts.app))) {
      log.errorAndThrow(`Could not find app at ${this.opts.app}`);
    }
  }

  async configureApp () {
    function appIsPackageOrBundle (app) {
      return (/^([a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+)+$/).test(app);
    }

    // the app name is a bundleId assign it to the bundleId property
    if (!this.opts.bundleId && appIsPackageOrBundle(this.opts.app)) {
      this.opts.bundleId = this.opts.app;
      return;
    }
    // we have a bundle ID, but no app, or app is also a bundle
    if ((this.opts.bundleId && appIsPackageOrBundle(this.opts.bundleId)) &&
        (this.opts.app === '' || appIsPackageOrBundle(this.opts.app))) {
      log.debug('App is an iOS bundle, will attempt to run as pre-existing');
      return;
    }


    // check for supported build-in apps
    if (this.opts.app && this.opts.app.toLowerCase() === 'settings') {
      this.opts.bundleId = 'com.apple.Preferences';
      this.opts.app = null;
      return;
    } else if (this.opts.app && this.opts.app.toLowerCase() === 'calendar') {
      this.opts.bundleId = 'com.apple.mobilecal';
      this.opts.app = null;
      return;
    }

    try {
      // download if necessary
      this.opts.app = await this.helpers.configureApp(this.opts.app, '.app');
    } catch (err) {
      log.error(err);
      throw new Error(
        `Bad app: ${this.opts.app}. App paths need to be absolute, or relative to the appium ` +
        'server install dir, or a URL to compressed file, or a special app name.');
    }
  }


  async determineDevice () {
    // in the one case where we create a sim, we will set this state
    this.lifecycleData.createSim = false;

    // if we get generic names, translate them
    this.opts.deviceName = (function translateDeviceName (dn = '') {
      let deviceName = dn;
      if (dn.toLowerCase() === 'iphone simulator') {
        deviceName = 'iPhone 6';
      } else if (dn.toLowerCase() === 'ipad simulator') {
        deviceName = 'iPad 2';
      }
      if (deviceName !== dn) {
        log.debug(`Changing deviceName from '${dn}' to '${deviceName}'`);
      }
      return deviceName;
    })(this.opts.deviceName);

    // check for a particular simulator
    if (this.opts.udid && (await simExists(this.opts.udid))) {
      let device = await getSimulator(this.opts.udid);
      return {device, realDevice: false, udid: this.opts.udid};
    }

    // check for a particular real device
    if (this.opts.udid) {
      if (this.opts.udid.toLowerCase() === 'auto') {
        this.opts.udid = await detectUdid();
      } else {
        // make sure it is a connected device. If not, the udid passed in is invalid
        let devices = await getConnectedDevices();
        log.debug(`Available devices: ${devices.join(', ')}`);
        if (devices.indexOf(this.opts.udid) === -1) {
          throw new Error(`Unknown device or simulator UDID: '${this.opts.udid}'`);
        }
      }

      let device = await this.getIDeviceObj();
      return {device, realDevice: true, udid: this.opts.udid};
    }

    // figure out the correct simulator to use, given the desired capabilities
    let device = await getExistingSim(this.opts.deviceName, this.opts.platformVersion);

    // check for an existing simulator
    if (device) {
      if (this.opts.reset || this.opts.fullReset) {
        await device.clean();
        await device.shutdown();
      }
      return {device, realDevice: false, udid: device.udid};
    }

    // no device of this type exists, so create one
    log.info('Simluator udid not provided, using desired caps to create a new simulator');
    if (!this.opts.platformVersion) {
      log.info(`No platformVersion specified. Using latest version '${this.iosSdkVersion}'`);
      this.opts.platformVersion = this.iosSdkVersion;
    }
    device = await this.createSim();
    return {device, realDevice: false, udid: device.udid};
  }

  async startSim () {
    // TODO for now just kill all sims unless specified udid is booted.
    // if booted, use it. if not booted, start it up
    // if no udid, well lets see if we can start one up based on desired caps
    // if we support multiple sims we need to change this

    if (!await simBooted(this.opts.device)) {
      log.info(`Simulator with udid '${this.opts.udid}' not booted. Booting up now`);
      await killAllSimulators();
      await this.opts.device.run();
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

    await launch(this.opts.device.udid, this.opts.bundleId);

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

  async startWdaSession (bundleId, processArguments) {
    let args = processArguments ? processArguments.args : [];
    let env = processArguments ? processArguments.env : {};

    let desired = {
      desiredCapabilities: {
        bundleId,
        arguments: args,
        environment: env,
        shouldWaitForQuiescence: true
      }
    };

    await this.proxyCommand('/session', 'POST', desired);
  }

  // Override Proxy methods from BaseDriver
  proxyActive () {
    return this.jwpProxyActive;
  }

  getProxyAvoidList () {
    if (this.isWebview()) {
      return NO_PROXY_WEB_LIST;
    }
    return NO_PROXY_NATIVE_LIST;
  }

  canProxy () {
    return true;
  }

  isSafari () {
    return !!this.safari;
  }

  isRealDevice () {
    return this.opts.realDevice;
  }

  isSimulator () {
    return !this.opts.realDevice;
  }

  isWebview () {
    return this.isSafari() || this.isWebContext();
  }

  validateLocatorStrategy (strategy) {
    super.validateLocatorStrategy(strategy, this.isWebContext());
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

  async installApp () {
    if (this.isSafari()){
      return;
    }
    // if user has passed in desiredCaps.autoLaunch = false
    // meaning they will manage app install / launching
    if (this.opts.autoLaunch === false) {
      return;
    }

    if (this.isRealDevice()) {
      await this.installToRealDevice();
    } else {
      await this.installToSimulator();
    }
  }

  async installToSimulator () {
    if (this.opts.fullReset && this.opts.bundleId) {
      await removeApp(this.opts.device.udid, this.opts.bundleId);
    }
    await installApp(this.opts.device.udid, this.opts.app);
  }

  async installToRealDevice () {
    if (this.opts.udid) {
      if (await this.opts.device.isInstalled(this.opts.bundleId)) {
        log.debug("App is installed.");
        if (this.opts.fullReset) {
          log.debug("fullReset requested. Forcing app install after uninstall app");
          await this.opts.device.remove(this.opts.bundleId);
        } else {
          log.debug("fullReset not requested. No need to install.");
          return;
        }
      } else {
        log.debug("App is not installed. Will try to install.");
      }

      if (this.opts.app) {
        await this.opts.device.install(this.opts.app);
        log.debug('App installed.');
      } else {
        log.debug("Real device specified but no ipa or app path, assuming bundle ID is " +
                     "on device");
      }
    } else {
      log.debug("No device id or app, not installing to real device.");
    }
  }

  async getIDeviceObj () {
    log.debug(`Creating iDevice object with udid ${this.opts.udid}`);
    try {
      //This iDevice object could be ideviceinstaller (node-idevice) for future once we have ideviceinstaller working for ios 10
      let iDevice = new IOSDeploy(this.opts.udid);
      await iDevice.checkStatus();
      return iDevice;
    } catch (e) {
      let msg = "Could not initialize ios-deploy make sure it is " +
                "installed and works on your system";
      log.error(msg);
      throw new Error(msg);
    }
  }

  async setInitialOrientation (orientation) {
    if (typeof orientation === 'string') {
      orientation = orientation.toUpperCase();
      if (!_.includes(['LANDSCAPE', 'PORTRAIT'], orientation)) {
        log.debug(`Unable to set initial orientation to '${orientation}'`);
        return;
      }
      log.debug(`Setting initial orientation to '${orientation}'`);
      try {
        await this.proxyCommand('/orientation', 'POST', {orientation});
        this.opts.curOrientation = orientation;
      } catch (err) {
        log.warn(`Setting initial orientation failed with: ${err}`);
      }
    }
  }
}

for (let [cmd, fn] of _.toPairs(commands)) {
  XCUITestDriver.prototype[cmd] = fn;
}


export default XCUITestDriver;
export { XCUITestDriver };
