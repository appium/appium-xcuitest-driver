import { BaseDriver, DeviceSettings } from 'appium-base-driver';
import { util } from 'appium-support';
import _ from 'lodash';
import { launch } from 'node-simctl';
import WebDriverAgent from './wda/webdriveragent';
import log from './logger';
import { createSim, getExistingSim, runSimulatorReset, installToSimulator,
         shutdownOtherSimulators, shutdownSimulator } from './simulator-management';
import { simExists, getSimulator, installSSLCert, hasSSLCert } from 'appium-ios-simulator';
import { retryInterval } from 'asyncbox';
import { settings as iosSettings, defaultServerCaps, appUtils, IWDP } from 'appium-ios-driver';
import desiredCapConstraints from './desired-caps';
import commands from './commands/index';
import { detectUdid, getAndCheckXcodeVersion, getAndCheckIosSdkVersion,
         adjustWDAAttachmentsPermissions, checkAppPresent, getDriverInfo,
         clearSystemFiles, translateDeviceName, normalizeCommandTimeouts,
         DEFAULT_TIMEOUT_KEY, markSystemFilesForCleanup,
         printUser } from './utils';
import { getConnectedDevices, runRealDeviceReset, installToRealDevice,
         getRealDeviceObj } from './real-device-management';
import B from 'bluebird';
import AsyncLock from 'async-lock';


const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const WDA_SIM_STARTUP_RETRIES = 2;
const WDA_REAL_DEV_STARTUP_RETRIES = 1;
const WDA_REAL_DEV_TUTORIAL_URL = 'https://github.com/appium/appium-xcuitest-driver/blob/master/docs/real-device-config.md';
const WDA_STARTUP_RETRY_INTERVAL = 10000;
const DEFAULT_SETTINGS = {
  nativeWebTap: false,
  useJSONSource: false,
  shouldUseCompactResponses: true,
  elementResponseAttributes: "type,label",
};
// This lock assures, that each driver session does not
// affect shared resources of the other parallel sessions
const SHARED_RESOURCES_GUARD = new AsyncLock();


const NO_PROXY_NATIVE_LIST = [
  ['DELETE', /window/],
  ['GET', /^\/session\/[^\/]+$/],
  ['GET', /alert_text/],
  ['GET', /alert\/[^\/]+/],
  ['GET', /appium/],
  ['GET', /attribute/],
  ['GET', /context/],
  ['GET', /location/],
  ['GET', /log/],
  ['GET', /screenshot/],
  ['GET', /size/],
  ['GET', /source/],
  ['GET', /url/],
  ['GET', /window/],
  ['POST', /accept_alert/],
  ['POST', /actions$/],
  ['POST', /alert_text/],
  ['POST', /alert\/[^\/]+/],
  ['POST', /appium/],
  ['POST', /appium\/device\/is_locked/],
  ['POST', /appium\/device\/lock/],
  ['POST', /appium\/device\/unlock/],
  ['POST', /back/],
  ['POST', /clear/],
  ['POST', /context/],
  ['POST', /dismiss_alert/],
  ['POST', /element$/],
  ['POST', /elements$/],
  ['POST', /execute/],
  ['POST', /keys/],
  ['POST', /log/],
  ['POST', /moveto/],
  ['POST', /receive_async_response/], // always, in case context switches while waiting
  ['POST', /session\/[^\/]+\/location/], // geo location, but not element location
  ['POST', /shake/],
  ['POST', /timeouts/],
  ['POST', /touch/],
  ['POST', /url/],
  ['POST', /value/],
  ['POST', /window/],
];
const NO_PROXY_WEB_LIST = [
  ['DELETE', /cookie/],
  ['GET', /attribute/],
  ['GET', /cookie/],
  ['GET', /element/],
  ['GET', /text/],
  ['GET', /title/],
  ['POST', /clear/],
  ['POST', /click/],
  ['POST', /cookie/],
  ['POST', /element/],
  ['POST', /forward/],
  ['POST', /frame/],
  ['POST', /keys/],
  ['POST', /refresh/],
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
    this.settings = new DeviceSettings(DEFAULT_SETTINGS, this.onSettingsUpdate.bind(this));

    // we need a per-instance memoization of this method, so do it here
    this.getDevicePixelRatio = _.memoize(this.getDevicePixelRatio);
  }

  async onSettingsUpdate (key, value) {
    const proxySettings = [
      'shouldUseCompactResponses',
      'elementResponseAttributes'
    ];
    if (key === 'nativeWebTap') {
      this.opts.nativeWebTap = !!value;
    } else if (_.includes(proxySettings, key)) {
      await this.proxyCommand('/appium/settings', 'POST', {settings: {[key]: value}});
    }
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
    this.xcodeVersion = {};
    this.iosSdkVersion = null;
    this.contexts = [];
    this.implicitWaitMs = 0;
    this.asynclibWaitMs = 0;
    this.pageLoadMs = 6000;
    this.landscapeWebCoordsOffset = 0;
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

  async createSession (...args) {
    this.lifecycleData = {}; // this is used for keeping track of the state we start so when we delete the session we can put things back
    try {
      // TODO add validation on caps
      let [sessionId, caps] = await super.createSession(...args);
      this.opts.sessionId = sessionId;

      await this.start();

      // merge server capabilities + desired capabilities
      caps = Object.assign({}, defaultServerCaps, caps);
      // update the udid with what is actually used
      caps.udid = this.opts.udid;
      // ensure we track nativeWebTap capability as a setting as well
      if (_.has(this.opts, 'nativeWebTap')) {
        await this.updateSettings({nativeWebTap: this.opts.nativeWebTap});
      }
      // ensure we track useJSONSource capability as a setting as well
      if (_.has(this.opts, 'useJSONSource')) {
        await this.updateSettings({useJSONSource: this.opts.useJSONSource});
      }

      let wdaSettings = {
        elementResponseAttributes: DEFAULT_SETTINGS.elementResponseAttributes,
        shouldUseCompactResponses: DEFAULT_SETTINGS.shouldUseCompactResponses,
      };
      if (_.has(this.opts, 'elementResponseAttributes')) {
        wdaSettings.elementResponseAttributes = this.opts.elementResponseAttributes;
      }
      if (_.has(this.opts, 'shouldUseCompactResponses')) {
        wdaSettings.shouldUseCompactResponses = this.opts.shouldUseCompactResponses;
      }
      // ensure WDA gets our defaults instead of whatever its own might be
      await this.updateSettings(wdaSettings);
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

    await printUser();

    if (this.opts.platformVersion && parseFloat(this.opts.platformVersion) < 9.3) {
      throw Error(`Platform version must be 9.3 or above. '${this.opts.platformVersion}' is not supported.`);
    }

    if (_.isEmpty(this.xcodeVersion) && (!this.opts.webDriverAgentUrl || !this.opts.realDevice)) {
      // no `webDriverAgentUrl`, or on a simulator, so we need an Xcode version
      this.xcodeVersion = await getAndCheckXcodeVersion();
      let tools = !this.xcodeVersion.toolsVersion ? '' : `(tools v${this.xcodeVersion.toolsVersion})`;
      log.debug(`Xcode version set to '${this.xcodeVersion.versionString}' ${tools}`);

      this.iosSdkVersion = await getAndCheckIosSdkVersion();
      log.debug(`iOS SDK Version set to '${this.iosSdkVersion}'`);
    }

    this.logEvent('xcodeDetailsRetrieved');

    let {device, udid, realDevice} = await this.determineDevice();
    log.info(`Determining device to run tests on: udid: '${udid}', real device: ${realDevice}`);
    this.opts.device = device;
    this.opts.udid = udid;
    this.opts.realDevice = realDevice;

    if (this.opts.enableAsyncExecuteFromHttps && !this.isRealDevice()) {
      // shutdown the simulator so that the ssl cert is recognized
      await shutdownSimulator(this.opts.device);
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

    if (!this.opts.webDriverAgentUrl && this.iosSdkVersion) {
      // make sure that the xcode we are using can handle the platform
      if (parseFloat(this.opts.platformVersion) > parseFloat(this.iosSdkVersion)) {
        let msg = `Xcode ${this.xcodeVersion.versionString} has a maximum SDK version of ${this.iosSdkVersion}. ` +
                  `It does not support iOS version ${this.opts.platformVersion}`;
        log.errorAndThrow(msg);
      }
    } else {
      log.debug('Xcode version will not be validated against iOS SDK version.');
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
    }

    if (!this.opts.bundleId) {
      this.opts.bundleId = await appUtils.extractBundleId(this.opts.app);
    }

    await this.runReset();

    const startLogCapture = async () => {
      const result = await this.startLogCapture();
      if (result) {
        this.logEvent('logCaptureStarted');
      }
      return result;
    };
    const isLogCaptureStarted = await startLogCapture();

    log.info(`Setting up ${this.isRealDevice() ? 'real device' : 'simulator'}`);

    if (this.isSimulator()) {
      if (this.opts.shutdownOtherSimulators) {
        if (!this.relaxedSecurityEnabled) {
          log.errorAndThrow(`Appium server must have relaxed security flag set in order ` +
                            `for 'shutdownOtherSimulators' capability to work`);
        }
        await shutdownOtherSimulators(this.opts.device);
      }

      this.localConfig = await iosSettings.setLocaleAndPreferences(this.opts.device, this.opts, this.isSafari(), async (sim) => {
        await shutdownSimulator(sim);
        // we don't know if there needs to be changes a priori, so change first.
        // sometimes the shutdown process changes the settings, so reset them,
        // knowing that the sim is already shut
        await iosSettings.setLocaleAndPreferences(sim, this.opts, this.isSafari());
      });

      // Cleanup of installd cache helps to save disk space while running multiple tests
      // without restarting the Simulator: https://github.com/appium/appium/issues/9410
      await this.opts.device.clearCaches('com.apple.mobile.installd.staging');

      await this.startSim();

      if (this.opts.customSSLCert) {
        if (await hasSSLCert(this.opts.customSSLCert, this.opts.udid)) {
          log.info(`SSL cert '${_.truncate(this.opts.customSSLCert, {length: 20})}' already installed`);
        } else {
          log.info(`Installing ssl cert '${_.truncate(this.opts.customSSLCert, {length: 20})}'`);
          await shutdownSimulator(this.opts.device);
          await installSSLCert(this.opts.customSSLCert, this.opts.udid);
          log.info(`Restarting Simulator so that SSL certificate installation takes effect`);
          await this.startSim();
          this.logEvent('customCertInstalled');
        }
      }

      this.logEvent('simStarted');
      if (!isLogCaptureStarted) {
        // Retry log capture if Simulator was not running before
        await startLogCapture();
      }
    }

    if (this.opts.app) {
      await this.installAUT();
      this.logEvent('appInstalled');
    }

    // if we only have bundle identifier and no app, fail if it is not already installed
    if (!this.opts.app && this.opts.bundleId && !this.safari) {
      if (!await this.opts.device.isAppInstalled(this.opts.bundleId)) {
        log.errorAndThrow(`App with bundle identifier '${this.opts.bundleId}' unknown`);
      }
    }

    await SHARED_RESOURCES_GUARD.acquire(XCUITestDriver.name,
      async () => await this.startWda(this.opts.sessionId, realDevice));

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
    this.wda = new WebDriverAgent(this.xcodeVersion, this.opts);

    await this.wda.cleanupObsoleteProcesses();

    if (this.opts.useNewWDA) {
      log.debug(`Capability 'useNewWDA' set to true, so uninstalling WDA before proceeding`);
      await this.wda.quit();
      await this.wda.uninstall();
      this.logEvent('wdaUninstalled');
    } else if (!util.hasValue(this.wda.webDriverAgentUrl) && (await this.wda.isRunning())) {
      log.info(`Will reuse previously cached WDA instance at '${this.wda.url.href}'. ` +
               `Set the wdaLocalPort capability to a value different from ${this.wda.url.port} ` +
               `if this is an undesired behavior.`);
      this.wda.webDriverAgentUrl = this.wda.url.href;
    }

    // local helper for the two places we need to uninstall wda and re-start it
    const quitAndUninstall = async (msg) => {
      log.debug(msg);
      log.debug('Quitting and uninstalling WebDriverAgent, then retrying');
      await this.wda.quit();
      await this.wda.uninstall();
      throw new Error(msg);
    };

    const startupRetries = this.opts.wdaStartupRetries || (this.isRealDevice() ? WDA_REAL_DEV_STARTUP_RETRIES : WDA_SIM_STARTUP_RETRIES);
    const startupRetryInterval = this.opts.wdaStartupRetryInterval || WDA_STARTUP_RETRY_INTERVAL;
    await retryInterval(startupRetries, startupRetryInterval, async () => {
      this.logEvent('wdaStartAttempted');
      try {
        this.cachedWdaStatus = await this.wda.launch(sessionId, realDevice);
      } catch (err) {
        this.logEvent('wdaStartFailed');
        let errorMsg = `Unable to launch WebDriverAgent because of xcodebuild failure: "${err.message}".`;
        if (this.isRealDevice()) {
          errorMsg += ` Make sure you follow the tutorial at ${WDA_REAL_DEV_TUTORIAL_URL}. ` +
                      `Try to remove the WebDriverAgentRunner application from the device if it is installed ` +
                      `and reboot the device.`;
        }
        await quitAndUninstall(errorMsg);
      }

      this.proxyReqRes = this.wda.proxyReqRes.bind(this.wda);
      this.jwpProxyActive = true;

      try {
        await retryInterval(15, 1000, async () => {
          this.logEvent('wdaSessionAttempted');
          log.debug('Sending createSession command to WDA');
          try {
            this.cachedWdaStatus = this.cachedWdaStatus || await this.proxyCommand('/status', 'GET');
            await this.startWdaSession(this.opts.bundleId, this.opts.processArguments);
          } catch (err) {
            log.debug('Failed to create WDA session. Retrying...');
            throw err;
          }
        });
        this.logEvent('wdaSessionStarted');
      } catch (err) {
        let errorMsg = `Unable to start WebDriverAgent session because of xcodebuild failure: "${err.message}".`;
        if (this.isRealDevice()) {
          errorMsg += ` Make sure you follow the tutorial at ${WDA_REAL_DEV_TUTORIAL_URL}. ` +
                      `Try to remove the WebDriverAgentRunner application from the device if it is installed ` +
                      `and reboot the device.`;
        }
        await quitAndUninstall(errorMsg);
      }

      if (!util.hasValue(this.opts.preventWDAAttachments)) {
        // XCTest prior to Xcode 9 SDK has no native way to disable attachments
        this.opts.preventWDAAttachments = this.xcodeVersion.major < 9;
        if (this.opts.preventWDAAttachments) {
          log.info('Enabled WDA attachments prevention by default to save the disk space. ' +
                   `Set 'preventWDAAttachments' capability to false if this is an undesired behavior.`);
        }
      }
      if (this.opts.preventWDAAttachments) {
        await adjustWDAAttachmentsPermissions(this.wda, this.opts.preventWDAAttachments ? '555' : '755');
        this.logEvent('wdaPermsAdjusted');
      }

      if (this.opts.clearSystemFiles) {
        await markSystemFilesForCleanup(this.wda);
      }

      // we expect certain socket errors until this point, but now
      // mark things as fully working
      this.wda.fullyStarted = true;
      this.logEvent('wdaStarted');
    });
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
    await SHARED_RESOURCES_GUARD.acquire(XCUITestDriver.name, async () => {
      await this.stop();

      // reset the permissions on the derived data folder, if necessary
      if (this.opts.preventWDAAttachments) {
        await adjustWDAAttachmentsPermissions(this.wda, '755');
      }

      if (this.opts.clearSystemFiles) {
        await clearSystemFiles(this.wda, !!this.opts.showXcodeLog);
      } else {
        log.debug('Not clearing log files. Use `clearSystemFiles` capability to turn on.');
      }
    });

    if (this.isWebContext()) {
      log.debug('In a web session. Removing remote debugger');
      await this.stopRemote();
    }

    if (this.opts.resetOnSessionStartOnly === false) {
      await this.runReset();
    }

    if (this.isSimulator() && !this.opts.noReset && !!this.opts.device) {
      if (this.lifecycleData.createSim) {
        log.debug(`Deleting simulator created for this run (udid: '${this.opts.udid}')`);
        await shutdownSimulator(this.opts.device);
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
      if (this.wda && !this.wda.webDriverAgentUrl && this.opts.useNewWDA) {
        await this.wda.quit();
      }
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
    this.opts.deviceName = await translateDeviceName(this.xcodeVersion, this.opts.platformVersion, this.opts.deviceName);

    // check for a particular simulator
    if (this.opts.udid && (await simExists(this.opts.udid))) {
      const device = await getSimulator(this.opts.udid);
      return {device, realDevice: false, udid: this.opts.udid};
    }

    if (this.opts.udid) {
      if (this.opts.udid.toLowerCase() === 'auto') {
        try {
          this.opts.udid = await detectUdid();
        } catch (err) {
          // Trying to find matching UDID for Simulator
          log.warn(`Cannot detect any connected real devices. Falling back to Simulator. Original error: ${err.message}`);
          const device = await getExistingSim(this.opts);
          if (!device) {
            // No matching Simulator is found. Throw an error
            log.errorAndThrow(`Cannot detect udid for ${this.opts.deviceName} Simulator running iOS ${this.opts.platformVersion}`);
          }
          // Matching Simulator exists and is found. Use it
          this.opts.udid = device.udid;
          return {device, realDevice: false, udid: device.udid};
        }
      } else {
        // make sure it is a connected device. If not, the udid passed in is invalid
        const devices = await getConnectedDevices();
        log.debug(`Available devices: ${devices.join(', ')}`);
        if (devices.indexOf(this.opts.udid) === -1) {
          throw new Error(`Unknown device or simulator UDID: '${this.opts.udid}'`);
        }
      }

      const device = await getRealDeviceObj(this.opts.udid);
      return {device, realDevice: true, udid: this.opts.udid};
    }

    // figure out the correct simulator to use, given the desired capabilities
    let device = await getExistingSim(this.opts);

    // check for an existing simulator
    if (device) {
      return {device, realDevice: false, udid: device.udid};
    }

    // no device of this type exists, so create one
    log.info('Simulator udid not provided, using desired caps to create a new simulator');
    if (!this.opts.platformVersion && this.iosSdkVersion) {
      log.info(`No platformVersion specified. Using latest version Xcode supports: '${this.iosSdkVersion}' ` +
               `This may cause problems if a simulator does not exist for this platform version.`);
      this.opts.platformVersion = this.iosSdkVersion;
    }

    if (this.opts.noReset) {
      // Check for existing simulator just with correct capabilities
      let device = await getExistingSim(this.opts);
      if (device) {
        return {device, realDevice: false, udid: device.udid};
      }
    }

    device = await this.createSim();
    return {device, realDevice: false, udid: device.udid};
  }

  async startSim () {
    const runOpts = {
      scaleFactor: this.opts.scaleFactor,
      connectHardwareKeyboard: !!this.opts.connectHardwareKeyboard,
      isHeadless: !!this.opts.isHeadless,
      devicePreferences: {},
    };

    // add the window center, if it is specified
    if (this.opts.SimulatorWindowCenter) {
      runOpts.devicePreferences.SimulatorWindowCenter = this.opts.SimulatorWindowCenter;
    }

    // This is to workaround XCTest bug about changing Simulator
    // orientation is not synchronized to the actual window orientation
    const orientation = _.isString(this.opts.orientation) && this.opts.orientation.toUpperCase();
    switch (orientation) {
      case 'LANDSCAPE':
        runOpts.devicePreferences.SimulatorWindowOrientation = 'LandscapeLeft';
        runOpts.devicePreferences.SimulatorWindowRotationAngle = 90;
        break;
      case 'PORTRAIT':
        runOpts.devicePreferences.SimulatorWindowOrientation = 'Portrait';
        runOpts.devicePreferences.SimulatorWindowRotationAngle = 0;
        break;
    }

    await this.opts.device.run(runOpts);
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
    let args = processArguments ? (processArguments.args || []) : [];
    if (!_.isArray(args)) {
      throw new Error(`processArguments.args capability is expected to be an array. ` +
                      `${JSON.stringify(args)} is given instead`);
    }
    let env = processArguments ? (processArguments.env || {}) : {};
    if (!_.isPlainObject(env)) {
      throw new Error(`processArguments.env capability is expected to be a dictionary. ` +
                      `${JSON.stringify(env)} is given instead`);
    }

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
    if (util.hasValue(this.opts.language)) {
      args.push('-AppleLanguages', `(${this.opts.language})`);
      args.push('-NSLanguages', `(${this.opts.language})`);
    }

    if (util.hasValue(this.opts.locale)) {
      args.push('-AppleLocale', this.opts.locale);
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
    if (util.hasValue(this.opts.shouldUseCompactResponses)) {
      desired.desiredCapabilities.shouldUseCompactResponses = this.opts.shouldUseCompactResponses;
    }
    if (util.hasValue(this.opts.elementResponseFields)) {
      desired.desiredCapabilities.elementResponseFields = this.opts.elementResponseFields;
    }

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
    this.opts.useNewWDA = util.hasValue(this.opts.useNewWDA) ? this.opts.useNewWDA : false;

    if (caps.commandTimeouts) {
      caps.commandTimeouts = normalizeCommandTimeouts(caps.commandTimeouts);
    }

    // finally, return true since the superclass check passed, as did this
    return true;
  }

  async installAUT () {
    if (this.isSafari()) {
      return;
    }
    // if user has passed in desiredCaps.autoLaunch = false
    // meaning they will manage app install / launching
    if (this.opts.autoLaunch === false) {
      return;
    }

    if (this.isRealDevice()) {
      await installToRealDevice(this.opts.device, this.opts.app, this.opts.bundleId, this.opts.noReset);
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
    if (!_.isString(orientation)) {
      log.info('Skipping setting of the initial display orientation. ' +
        'Set the "orientation" capability to either "LANDSCAPE" or "PORTRAIT", if this is an undesired behavior.');
      return;
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
      log.warn(`Setting initial orientation failed with: ${err.message}`);
    }
  }

  _getCommandTimeout (cmdName) {
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
    let deviceCaps = {};
    deviceCaps.pixelRatio = await this.getDevicePixelRatio();
    deviceCaps.statBarHeight = await this.getStatusBarHeight();
    deviceCaps.viewportRect = await this.getViewportRect();
    return Object.assign({udid: this.opts.udid}, driverSession,
      wdaCaps.capabilities, deviceCaps);
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

Object.assign(XCUITestDriver.prototype, commands);

export default XCUITestDriver;
export { XCUITestDriver };
