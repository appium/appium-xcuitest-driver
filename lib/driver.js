import { BaseDriver } from 'appium-base-driver';
import { util } from 'appium-support';
import _ from 'lodash';
import { launch } from 'node-simctl';
import WebDriverAgent from './webdriveragent';
import log from './logger';
import { simBooted, createSim, getExistingSim, runSimulatorReset,
         installToSimulator } from './simulator-management';
import { killAllSimulators, simExists, getSimulator, installSSLCert,
         uninstallSSLCert, BOOT_COMPLETED_EVENT } from 'appium-ios-simulator';
import { retryInterval } from 'asyncbox';
import { settings as iosSettings, defaultServerCaps, appUtils, IWDP } from 'appium-ios-driver';
import desiredCapConstraints from './desired-caps';
import commands from './commands/index';
import { detectUdid, getAndCheckXcodeVersion, getAndCheckIosSdkVersion,
         adjustWDAAttachmentsPermissions, checkAppPresent, getDriverInfo,
         clearSystemFiles } from './utils';
import { getConnectedDevices, runRealDeviceReset, installToRealDevice,
         getRealDeviceObj } from './real-device-management';
import B from 'bluebird';
import { version } from '../../package.json'; // eslint-disable-line import/no-unresolved


const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const WDA_STARTUP_RETRIES = 2;
const DEFAULT_TIMEOUT_KEY = 'default';
const WDA_STARTUP_RETRY_INTERVAL = 10000;

const NO_PROXY_NATIVE_LIST = [
  ['GET', /^\/session\/[^\/]+$/],
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
  ['GET', /screenshot/],
  ['POST', /appium/],
  ['GET', /appium/],
  ['POST', /touch/],
  ['GET', /log/],
  ['POST', /log/],
  ['POST', /moveto/],
  ['POST', /receive_async_response/], // always, in case context switches while waiting
  ['GET', /location/],
  ['GET', /size/],
  ['POST', /value/],
  ['POST', /keys/],
  ['POST', /back/],
  ['POST', /session\/[^\/]+\/location/], // geo location, but not element location
  ['POST', /appium\/device\/lock/],
  ['POST', /shake/],
  ['POST', /clear/],
];
const NO_PROXY_WEB_LIST = [
  ['GET', /title/],
  ['GET', /url/],
  ['POST', /url/],
  ['POST', /element/],
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
  ['POST', /keys/],
].concat(NO_PROXY_NATIVE_LIST);

function normalizeCommandTimeouts (value) {
  // The value is normalized already
  if (typeof value !== 'string') {
    return value;
  }

  let result = {};
  // Use as default timeout for all commands if a single integer value is provided
  if (!isNaN(value)) {
    result[DEFAULT_TIMEOUT_KEY] = _.toInteger(value);
    return result;
  }

  // JSON object has been provided. Let's parse it
  try {
    result = JSON.parse(value);
    if (!_.isPlainObject(result)) {
      throw new Error();
    }
  } catch (err) {
    log.errorAndThrow(`"commandTimeouts" capability should be a valid JSON object. "${value}" was given instead`);
  }
  for (let [cmd, timeout] of _.toPairs(result)) {
    if (!_.isInteger(timeout) || timeout <= 0) {
      log.errorAndThrow(`The timeout for "${cmd}" should be a valid natural number of milliseconds. "${timeout}" was given instead`);
    }
  }
  return result;
}


class XCUITestDriver extends BaseDriver {
  constructor (opts = {}, shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);

    log.debug(`XCUITestDriver version: ${version}`);

    this.desiredCapConstraints = desiredCapConstraints;

    this.locatorStrategies = [
      'xpath',
      'id',
      'name',
      'class name',
      '-ios predicate string',
      '-ios class chain',
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
    this.opts = this.opts || {};
    this.wda = null;
    this.opts.device = null;
    this.jwpProxyActive = false;
    this.proxyReqRes = null;
    this.jwpProxyAvoid = [];
    this.safari = false;
    this.cachedWdaStatus = null;

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
    if (typeof this.driverInfo === 'undefined') {
      this.driverInfo = await getDriverInfo();
    }
    let status = {build: {version: this.driverInfo.version}};
    if (this.cachedWdaStatus) {
      status.wda = this.cachedWdaStatus;
    }
    return status;
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
      // update the udid with what is actually used
      caps.udid = this.opts.udid;
      return [sessionId, caps];
    } catch (e) {
      log.error(e);
      await this.deleteSession();
      throw e;
    }
  }

  async start () {
    this.opts.noReset = !!this.opts.noReset;
    this.opts.fullReset = !!this.opts.fullReset;

    if (!this.xcodeVersion) {
      this.xcodeVersion = await getAndCheckXcodeVersion();
      let tools = !this.xcodeVersion.toolsVersion ? '' : `(tools v${this.xcodeVersion.toolsVersion})`;
      log.debug(`Xcode version set to '${this.xcodeVersion.versionString}' ${tools}`);
    }

    this.iosSdkVersion = await getAndCheckIosSdkVersion();
    log.debug(`iOS SDK Version set to '${this.iosSdkVersion}'`);

    if (this.opts.platformVersion && parseFloat(this.opts.platformVersion) < 9.3) {
      throw Error(`Platform version must be 9.3 or above. '${this.opts.platformVersion}' is not supported.`);
    }

    this.logEvent('xcodeDetailsRetrieved');

    let {device, udid, realDevice} = await this.determineDevice();
    log.info(`Determining device to run tests on: udid: '${udid}', real device: ${realDevice}`);
    this.opts.device = device;
    this.opts.udid = udid;
    this.opts.realDevice = realDevice;

    if (this.isSimulator() && this.opts.customSSLCert) {
      await installSSLCert(this.opts.customSSLCert, this.opts.udid);
      this.logEvent('customCertInstalled');
    }

    if (this.opts.enableAsyncExecuteFromHttps && !this.isRealDevice()) {
      // shutdown the simulator so that the ssl cert is recognized
      await this.opts.device.shutdown();
      await this.startHttpsAsyncServer();
    }


    // at this point if there is no platformVersion, get it from the device
    if (!this.opts.platformVersion) {
      if (this.opts.device && _.isFunction(this.opts.device.getPlatformVersion)) {
        this.opts.platformVersion = await this.opts.device.getPlatformVersion();
        log.info(`No platformVersion specified. Using device version: '${this.opts.platformVersion}'`);
      } else {
        // TODO: this is when it is a real device. when we have a real object wire it in
      }
    }

    // make sure that the xcode we are using can handle the platform
    if (parseFloat(this.opts.platformVersion) > parseFloat(this.iosSdkVersion)) {
      let msg = `Xcode ${this.xcodeVersion.versionString} has a maximum SDK version of ${this.iosSdkVersion}. ` +
                `It does not support iOS version ${this.opts.platformVersion}`;
      log.errorAndThrow(msg);
    }

    if ((this.opts.browserName || '').toLowerCase() === 'safari') {
      log.info('Safari test requested');
      this.safari = true;
      this.opts.app = undefined;
      this.opts.processArguments = this.opts.processArguments || {};
      this.opts.bundleId = SAFARI_BUNDLE_ID;
      this._currentUrl = this.opts.safariInitialUrl || (
        this.isRealDevice() ?
        'http://appium.io' :
        `http://${this.opts.address}:${this.opts.port}/welcome`
      );
      this.opts.processArguments.args = ['-u', this._currentUrl];
    } else {
      await this.configureApp();
    }
    this.logEvent('appConfigured');

    // fail very early if the app doesn't actually exist
    // or if bundle id doesn't point to an installed app
    if (this.opts.app) {
      await checkAppPresent(this.opts.app);
    } else if (this.opts.bundleId && !this.safari) {
      if (!await this.opts.device.isAppInstalled(this.opts.bundleId)) {
        log.errorAndThrow(`App with bundle identifier '${this.opts.bundleId}' unknown`);
      }
    }

    if (!this.opts.bundleId) {
      this.opts.bundleId = await this.extractBundleId(this.opts.app);
    }

    if (!this.opts.realDevice) {
      if (typeof this.opts.scaleFactor !== 'undefined') {
        log.info(`Setting non-default Simulator scale factor to '${this.opts.scaleFactor}'`);
        device.setScaleFactor(this.opts.scaleFactor);
      }
      if (typeof this.opts.connectHardwareKeyboard !== 'undefined') {
        log.info(`Setting 'connectHardwareKeyboard' Simulator option to '${this.opts.connectHardwareKeyboard ? 'on' : 'off'}'`);
        device.setConnectHardwareKeyboard(this.opts.connectHardwareKeyboard);
      }
    }

    await this.runReset();

    // handle logging
    await this.startLogCapture();
    this.logEvent('logCaptureStarted');

    log.info(`Setting up ${this.isRealDevice() ? 'real device' : 'simulator'}`);

    if (this.isRealDevice()) {
      if (this.opts.app) {
        await this.installApp();
        this.logEvent('appInstalled');
      }
    } else {
      this.localeConfig = await iosSettings.setLocale(this.opts.device, this.opts, {}, this.isSafari());
      await iosSettings.setPreferences(this.opts.device, this.opts, this.isSafari());
      let installAppPromise = null;
      if (this.opts.app) {
        if (await simBooted(this.opts.device)) {
          installAppPromise = this.installApp();
        } else {
          installAppPromise = new B(async (resolve, reject) => {
            this.opts.device.on(BOOT_COMPLETED_EVENT, async () => {
              try {
                await this.installApp();
                resolve();
              } catch (err) {
                reject(err);
              }
            });
          });
        }
      }
      await this.startSim();
      this.logEvent('simStarted');
      await installAppPromise;
      this.logEvent('appInstalled');
    }

    await this.startWda(this.opts.sessionId, realDevice);

    await this.setInitialOrientation(this.opts.orientation);
    this.logEvent('orientationSet');


    if (this.isRealDevice() && this.opts.startIWDP) {
      try {
        await this.startIWDP();
        log.debug(`Started ios_webkit_debug proxy server at: ${this.iwdpServer.endpoint}`);
      } catch (err) {
        log.errorAndThrow(`Could not start ios_webkit_debug_proxy server: ${err.message}`);
      }
    }

    if (this.isSafari() || this.opts.autoWebview) {
      log.debug('Waiting for initial webview');
      await this.navToInitialWebview();
      this.logEvent('initialWebviewNavigated');
    }

    if (!this.isRealDevice()) {
      if (this.opts.calendarAccessAuthorized) {
        await this.opts.device.enableCalendarAccess(this.opts.bundleId);
      } else if (this.opts.calendarAccessAuthorized === false) {
        await this.opts.device.disableCalendarAccess(this.opts.bundleId);
      }
    }
  }

  async startWda (sessionId, realDevice) {
    let startupRetries = this.opts.wdaStartupRetries || WDA_STARTUP_RETRIES;
    let startupRetryInterval = this.opts.wdaStartupRetryInterval || WDA_STARTUP_RETRY_INTERVAL;
    await retryInterval(startupRetries, startupRetryInterval, async () => {
      this.logEvent('wdaStartAttempted');
      this.wda = new WebDriverAgent(this.xcodeVersion, this.opts);

      if (this.opts.useNewWDA) {
        log.debug(`Capability 'useNewWDA' set, so uninstalling WDA before proceeding`);
        await this.wda.uninstall();
        this.logEvent('wdaUninstalled');
      }

      // local helper for the two places we need to uninstall wda and re-start it
      let quitAndUninstall = async (msg) => {
        log.debug(msg);
        log.debug('Quitting and uninstalling WebDriverAgent, then retrying');
        await this.wda.quit();
        await this.wda.uninstall();
        throw new Error(msg);
      };

      let wdaStatus = null;
      try {
        wdaStatus = await this.wda.launch(sessionId, realDevice);
      } catch (err) {
        this.logEvent('wdaStartFailed');
        await quitAndUninstall(`Unable to launch WebDriverAgent because of xcodebuild failure: ${err.message}`);
      }

      this.proxyReqRes = this.wda.proxyReqRes.bind(this.wda);
      this.jwpProxyActive = true;

      try {
        await retryInterval(15, 1000, async () => {
          this.logEvent('wdaSessionAttempted');
          log.debug('Sending createSession command to WDA');
          try {
            if (wdaStatus) {
              this.cachedWdaStatus = wdaStatus;
            } else {
              // This will put the '/status' output into the cache
              await this.proxyCommand('/status', 'GET');
            }
            await this.startWdaSession(this.opts.bundleId, this.opts.processArguments);
          } catch (err) {
            log.debug('Failed to create WDA session. Retrying...');
            throw err;
          }
        });
        this.logEvent('wdaSessionStarted');
      } catch (err) {
        return await quitAndUninstall(`Unable to start WebDriverAgent session: ${err.message}`);
      }

      this.opts.preventWDAAttachments = !util.hasValue(this.opts.preventWDAAttachments) || this.opts.preventWDAAttachments;
      await adjustWDAAttachmentsPermissions(this.opts.preventWDAAttachments ? '555' : '755');
      this.logEvent('wdaPermsAdjusted');

      // we expect certain socket errors until this point, but now
      // mark things as fully working
      this.wda.fullyStarted = true;
      this.logEvent('wdaStarted');
    });
  }

  // create an alias so we can actually unit test createSession by stubbing
  // this
  async extractBundleId (app) {
    return await appUtils.extractBundleId(app);
  }

  async runReset (opts = null) {
    this.logEvent('resetStarted');
    if (this.isRealDevice()) {
      await runRealDeviceReset(this.opts.device, opts || this.opts);
    } else {
      await runSimulatorReset(this.opts.device, opts || this.opts);
    }
    this.logEvent('resetComplete');
  }

  async deleteSession () {
    await this.stop();

    // reset the permissions on the derived data folder, if necessary
    if (this.opts.preventWDAAttachments) {
      await adjustWDAAttachmentsPermissions('755');
    }

    if (this.opts.clearSystemFiles) {
      await clearSystemFiles(this.wda, !!this.opts.showXcodeLog);
    } else {
      log.debug('Not clearing log files. Use `clearSystemFiles` capability to turn on.');
    }

    if (this.isWebContext()) {
      log.debug('In a web session. Removing remote debugger');
      await this.stopRemote();
    }

    if (this.opts.resetOnSessionStartOnly === false) {
      await this.runReset();
    }

    if (this.isSimulator() && this.opts.udid && this.opts.customSSLCert) {
      await uninstallSSLCert(this.opts.customSSLCert, this.opts.udid);
    }

    if (this.isSimulator() && !this.opts.noReset && !!this.opts.device) {
      if (this.lifecycleData.createSim) {
        log.debug('Deleting simulator created for this run');
        await this.opts.device.shutdown();
        await this.opts.device.delete();
      }
    }

    if (!_.isEmpty(this.logs)) {
      this.logs.syslog.stopCapture();
      this.logs = {};
    }

    if (this.iwdpServer) {
      this.stopIWDP();
    }

    if (this.opts.enableAsyncExecuteFromHttps && !this.isRealDevice()) {
      await this.stopHttpsAsyncServer();
    }

    this.resetIos();

    await super.deleteSession();
  }

  async stop () {
    this.jwpProxyActive = false;
    this.proxyReqRes = null;

    if (this.wda && this.wda.fullyStarted) {
      if (this.wda.jwproxy) {
        try {
          await this.proxyCommand(`/session/${this.sessionId}`, 'DELETE');
        } catch (err) {
          // an error here should not short-circuit the rest of clean up
          log.debug(`Unable to DELETE session on WDA: '${err.message}'. Continuing shutdown.`);
        }
      }
      await this.wda.quit();
    }
  }

  async executeCommand (cmd, ...args) {
    log.debug(`Executing command '${cmd}'`);

    if (cmd === 'receiveAsyncResponse') {
      return await this.receiveAsyncResponse(...args);
    }
    // TODO: once this fix gets into base driver remove from here
    if (cmd === 'getStatus') {
      return await this.getStatus();
    }
    return await super.executeCommand(cmd, ...args);
  }

  async configureApp () {
    function appIsPackageOrBundle (app) {
      return (/^([a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+)+$/).test(app);
    }

    // the app name is a bundleId assign it to the bundleId property
    if (!this.opts.bundleId && appIsPackageOrBundle(this.opts.app)) {
      this.opts.bundleId = this.opts.app;
      this.opts.app = '';
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
      this.opts.app = await this.helpers.configureApp(this.opts.app, '.app', this.opts.mountRoot, this.opts.windowsShareUserName, this.opts.windowsSharePassword);
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
        deviceName = 'iPad Retina';
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

      let device = await getRealDeviceObj(this.opts.udid);
      return {device, realDevice: true, udid: this.opts.udid};
    }

    // figure out the correct simulator to use, given the desired capabilities
    let device = await getExistingSim(this.opts.deviceName, this.opts.platformVersion);

    // check for an existing simulator
    if (device) {
      return {device, realDevice: false, udid: device.udid};
    }

    // no device of this type exists, so create one
    log.info('Simulator udid not provided, using desired caps to create a new simulator');
    if (!this.opts.platformVersion) {
      log.info(`No platformVersion specified. Using latest version Xcode supports: '${this.iosSdkVersion}' ` +
               `This may cause problems if a simulator does not exist for this platform version.`);
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

    if (await simBooted(this.opts.device)) {
      log.info(`Simulator with udid '${this.opts.udid}' already booted`);
      return;
    }
    log.info(`Simulator with udid '${this.opts.udid}' not booted. Booting up now`);
    await killAllSimulators();
    await this.opts.device.run(undefined, this.opts.allowTouchIdEnroll);
  }

  async createSim () {
    this.lifecycleData.createSim = true;

    // create sim for caps
    let sim = await createSim(this.opts, this.sessionId);
    log.info(`Created simulator with udid '${sim.udid}'.`);

    return sim;
  }

  async launchApp () {
    const APP_LAUNCH_TIMEOUT = 20 * 1000;

    this.logEvent('appLaunchAttempted');
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
    this.logEvent('appLaunched');
  }

  async startWdaSession (bundleId, processArguments) {
    let args = processArguments ? processArguments.args : [];
    let env = processArguments ? processArguments.env : {};

    let shouldWaitForQuiescence = util.hasValue(this.opts.waitForQuiescence) ? this.opts.waitForQuiescence : true;
    let maxTypingFrequency = util.hasValue(this.opts.maxTypingFrequency) ? this.opts.maxTypingFrequency : 60;
    let shouldUseSingletonTestManager = util.hasValue(this.opts.shouldUseSingletonTestManager) ? this.opts.shouldUseSingletonTestManager : true;
    let shouldUseTestManagerForVisibilityDetection = false;
    if (util.hasValue(this.opts.simpleIsVisibleCheck)) {
      shouldUseTestManagerForVisibilityDetection = this.opts.simpleIsVisibleCheck;
    }
    if (!isNaN(parseFloat(this.opts.platformVersion)) && parseFloat(this.opts.platformVersion).toFixed(1) === '9.3') {
      log.info(`Forcing shouldUseSingletonTestManager capability value to true, because of known XCTest issues under 9.3 platform version`);
      shouldUseTestManagerForVisibilityDetection = true;
    }

    let desired = {
      desiredCapabilities: {
        bundleId,
        arguments: args,
        environment: env,
        shouldWaitForQuiescence,
        shouldUseTestManagerForVisibilityDetection,
        maxTypingFrequency,
        shouldUseSingletonTestManager,
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
    if (!res) {
      return res;
    }

    // make sure that the capabilities have one of `app` or `bundleId`
    if ((caps.browserName || '').toLowerCase() !== 'safari' &&
        !caps.app && !caps.bundleId) {
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
          log.errorAndThrow(`processArguments must be a json format or an object with format {args : [], env : {a:b, c:d}}. Both environment and argument can be null. Error: ${err}`);
        }
      } else if (_.isObject(caps.processArguments)) {
        verifyProcessArgument(caps.processArguments);
      } else {
        log.errorAndThrow('processArguments must be an object, or a string JSON object with format {args : [], env : {a:b, c:d}}. Both environment and argument can be null.');
      }
    }

    // there is no point in having `keychainPath` without `keychainPassword`
    if ((caps.keychainPath && !caps.keychainPassword) || (!caps.keychainPath && caps.keychainPassword)) {
      log.errorAndThrow(`If 'keychainPath' is set, 'keychainPassword' must also be set (and vice versa).`);
    }

    if (caps.autoAcceptAlerts || caps.autoDismissAlerts) {
      log.warn(`The capabilities 'autoAcceptAlerts' and 'autoDismissAlerts' ` +
               `do not work for XCUITest-based tests. Please adjust your ` +
               `alert handling accordingly.`);
    }

    // `resetOnSessionStartOnly` should be set to true by default
    this.opts.resetOnSessionStartOnly = !util.hasValue(this.opts.resetOnSessionStartOnly) || this.opts.resetOnSessionStartOnly;

    // finally, return true since the superclass check passed, as did this
    return true;
  }

  async installApp () {
    if (this.isSafari()) {
      return;
    }
    // if user has passed in desiredCaps.autoLaunch = false
    // meaning they will manage app install / launching
    if (this.opts.autoLaunch === false) {
      return;
    }

    if (this.isRealDevice()) {
      await installToRealDevice (this.opts.device, this.opts.app, this.opts.bundleId, this.opts.noReset);
    } else {
      await installToSimulator(this.opts.device, this.opts.app, this.opts.bundleId, this.opts.noReset);
    }

    if (util.hasValue(this.opts.iosInstallPause)) {
      // https://github.com/appium/appium/issues/6889
      let pause = parseInt(this.opts.iosInstallPause, 10);
      log.debug(`iosInstallPause set. Pausing ${pause} ms before continuing`);
      await B.delay(pause);
    }
  }

  async setInitialOrientation (orientation) {
    if (typeof orientation !== 'string') {
      orientation = 'PORTRAIT';
    }
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

  _getCommandTimeout (cmdName) {
    this.opts.commandTimeouts = normalizeCommandTimeouts(this.opts.commandTimeouts);
    if (this.opts.commandTimeouts) {
      if (cmdName && _.has(this.opts.commandTimeouts, cmdName)) {
        return this.opts.commandTimeouts[cmdName];
      }
      return this.opts.commandTimeouts[DEFAULT_TIMEOUT_KEY];
    }
  }

  /**
   * Get session capabilities merged with what WDA reports
   * This is a library command but needs to call 'super' so can't be on
   * a helper object
   */
  async getSession () {
    // call super to get event timings, etc...
    let driverSession = await super.getSession();
    let wdaCaps = await this.proxyCommand('/', 'GET');
    log.info("Merging WDA caps over Appium caps for session detail response");
    return Object.assign({udid: this.opts.udid}, driverSession, wdaCaps.capabilities);
  }

  async startIWDP () {
    this.logEvent('iwdpStarting');
    this.iwdpServer = new IWDP(this.opts.webkitDebugProxyPort, this.opts.udid);
    await this.iwdpServer.start();
    this.logEvent('iwdpStarted');
  }

  async stopIWDP () {
    if (this.iwdpServer) {
      await this.iwdpServer.stop();
      delete this.iwdpServer;
    }
  }

  async reset () {
    if (this.opts.noReset) {
      // This is to make sure reset happens even if noReset is set to true
      let opts = _.cloneDeep(this.opts);
      opts.noReset = false;
      opts.fullReset = false;
      const shutdownHandler = this.resetOnUnexpectedShutdown;
      this.resetOnUnexpectedShutdown = () => {};
      try {
        await this.runReset(opts);
      } finally {
        this.resetOnUnexpectedShutdown = shutdownHandler;
      }
    }
    await super.reset();
  }

}

for (let [cmd, fn] of _.toPairs(commands)) {
  XCUITestDriver.prototype[cmd] = fn;
}


export default XCUITestDriver;
export { XCUITestDriver };
