import { BaseDriver, DeviceSettings } from 'appium-base-driver';
import { util, fs, mjpeg } from 'appium-support';
import _ from 'lodash';
import url from 'url';
import { launch, openUrl } from 'node-simctl';
import WebDriverAgent from './wda/webdriveragent';
import log from './logger';
import {
  createSim, getExistingSim, runSimulatorReset, installToSimulator,
  shutdownOtherSimulators, shutdownSimulator } from './simulator-management';
import { simExists, getSimulator, installSSLCert, hasSSLCert } from 'appium-ios-simulator';
import { retryInterval, retry } from 'asyncbox';
import { settings as iosSettings, defaultServerCaps, appUtils } from 'appium-ios-driver';
import { desiredCapConstraints, PLATFORM_NAME_IOS, PLATFORM_NAME_TVOS } from './desired-caps';
import commands from './commands/index';
import {
  detectUdid, getAndCheckXcodeVersion, getAndCheckIosSdkVersion,
  checkAppPresent, getDriverInfo,
  clearSystemFiles, translateDeviceName, normalizeCommandTimeouts,
  DEFAULT_TIMEOUT_KEY, markSystemFilesForCleanup,
  printUser, removeAllSessionWebSocketHandlers, verifyApplicationPlatform, isTvOS,
  normalizePlatformVersion, isLocalHost } from './utils';
import {
  getConnectedDevices, runRealDeviceReset, installToRealDevice,
  getRealDeviceObj, getOSVersion } from './real-device-management';
import B from 'bluebird';
import AsyncLock from 'async-lock';
import path from 'path';
import IDB from 'appium-idb';
import DEVICE_CONNECTIONS_FACTORY from './device-connections-factory';


const SHUTDOWN_OTHER_FEAT_NAME = 'shutdown_other_sims';
const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const WDA_SIM_STARTUP_RETRIES = 2;
const WDA_REAL_DEV_STARTUP_RETRIES = 1;
const WDA_REAL_DEV_TUTORIAL_URL = 'https://github.com/appium/appium-xcuitest-driver/blob/master/docs/real-device-config.md';
const WDA_STARTUP_RETRY_INTERVAL = 10000;
const DEFAULT_SETTINGS = {
  nativeWebTap: false,
  useJSONSource: false,
  shouldUseCompactResponses: true,
  elementResponseAttributes: 'type,label',
  // Read https://github.com/appium/WebDriverAgent/blob/master/WebDriverAgentLib/Utilities/FBConfiguration.m for following settings' values
  mjpegServerScreenshotQuality: 25,
  mjpegServerFramerate: 10,
  screenshotQuality: 1,
  mjpegScalingFactor: 100,
  // set `reduceMotion` to `null` so that it will be verified but still set either true/false
  reduceMotion: null,
};
// This lock assures, that each driver session does not
// affect shared resources of the other parallel sessions
const SHARED_RESOURCES_GUARD = new AsyncLock();

/* eslint-disable no-useless-escape */
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
  ['GET', /timeouts$/],
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
  ['POST', /element\/active/], // MJSONWP get active element should proxy
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
/* eslint-enable no-useless-escape */

const MEMOIZED_FUNCTIONS = [
  'getStatusBarHeight',
  'getDevicePixelRatio',
  'getScreenInfo',
  'getSafariIsIphone',
  'getSafariIsIphoneX',
];

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
    this.logs = {};

    // memoize functions here, so that they are done on a per-instance basis
    for (const fn of MEMOIZED_FUNCTIONS) {
      this[fn] = _.memoize(this[fn]);
    }
  }

  async onSettingsUpdate (key, value) {
    if (key !== 'nativeWebTap') {
      return await this.proxyCommand('/appium/settings', 'POST', {
        settings: {[key]: value}
      });
    }
    this.opts.nativeWebTap = !!value;
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
      if (_.has(this.opts, 'mjpegServerScreenshotQuality')) {
        wdaSettings.mjpegServerScreenshotQuality = this.opts.mjpegServerScreenshotQuality;
      }
      if (_.has(this.opts, 'mjpegServerFramerate')) {
        wdaSettings.mjpegServerFramerate = this.opts.mjpegServerFramerate;
      }
      if (_.has(this.opts, 'screenshotQuality')) {
        log.info(`Setting the quality of phone screenshot: '${this.opts.screenshotQuality}'`);
        wdaSettings.screenshotQuality = this.opts.screenshotQuality;
      }
      // ensure WDA gets our defaults instead of whatever its own might be
      await this.updateSettings(wdaSettings);

      // turn on mjpeg stream reading if requested
      if (this.opts.mjpegScreenshotUrl) {
        log.info(`Starting MJPEG stream reading URL: '${this.opts.mjpegScreenshotUrl}'`);
        this.mjpegStream = new mjpeg.MJpegStream(this.opts.mjpegScreenshotUrl);
        await this.mjpegStream.start();
      }
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

    this.opts.iosSdkVersion = null; // For WDA and xcodebuild
    const {device, udid, realDevice} = await this.determineDevice();
    log.info(`Determining device to run tests on: udid: '${udid}', real device: ${realDevice}`);
    this.opts.device = device;
    this.opts.udid = udid;
    this.opts.realDevice = realDevice;

    const normalizedVersion = normalizePlatformVersion(this.opts.platformVersion);
    if (this.opts.platformVersion !== normalizedVersion) {
      log.info(`Normalized platformVersion capability value '${this.opts.platformVersion}' to '${normalizedVersion}'`);
      this.opts.platformVersion = normalizedVersion;
    }
    if (util.compareVersions(this.opts.platformVersion, '<', '9.3')) {
      throw new Error(`Platform version must be 9.3 or above. '${this.opts.platformVersion}' is not supported.`);
    }

    if (_.isEmpty(this.xcodeVersion) && (!this.opts.webDriverAgentUrl || !this.opts.realDevice)) {
      // no `webDriverAgentUrl`, or on a simulator, so we need an Xcode version
      this.xcodeVersion = await getAndCheckXcodeVersion();
    }
    this.logEvent('xcodeDetailsRetrieved');

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

    if ((this.opts.browserName || '').toLowerCase() === 'safari') {
      log.info('Safari test requested');
      this.safari = true;
      this.opts.app = undefined;
      this.opts.processArguments = this.opts.processArguments || {};
      this.opts.bundleId = SAFARI_BUNDLE_ID;
      this._currentUrl = this.opts.safariInitialUrl || (
        this.isRealDevice()
          ? 'http://appium.io'
          : `http://${this.opts.address}:${this.opts.port}/welcome`
      );
      if (util.compareVersions(this.opts.platformVersion, '<', '12.2')) {
        // this option does not work on 12.2 and above
        this.opts.processArguments.args = ['-u', this._currentUrl];
      }
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

    const memoizedLogInfo = _.memoize(function logInfo () {
      log.info("'skipLogCapture' is set. Skipping starting logs such as crash, system, safari console and safari network.");
    });
    const startLogCapture = async () => {
      if (this.opts.skipLogCapture) {
        memoizedLogInfo();
        return false;
      }

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
        this.ensureFeatureEnabled(SHUTDOWN_OTHER_FEAT_NAME);
        await shutdownOtherSimulators(this.opts.device);
      }

      // this should be done before the simulator is started
      // if it is already running, this cap won't work, which is documented
      if (this.isSafari() && this.opts.safariGlobalPreferences) {
        if (await this.opts.device.updateSafariGlobalSettings(this.opts.safariGlobalPreferences)) {
          log.debug(`Safari global preferences updated`);
        }
      }

      this.localConfig = await iosSettings.setLocaleAndPreferences(this.opts.device, this.opts, this.isSafari(), async (sim) => {
        await shutdownSimulator(sim);

        // we don't know if there needs to be changes a priori, so change first.
        // sometimes the shutdown process changes the settings, so reset them,
        // knowing that the sim is already shut
        await iosSettings.setLocaleAndPreferences(sim, this.opts, this.isSafari());
      });

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

      try {
        const idb = new IDB({udid});
        await idb.connect();
        this.opts.device.idb = idb;
      } catch (e) {
        log.info(`idb will not be used for Simulator interaction. Original error: ${e.message}`);
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

    if (this.opts.permissions) {
      if (this.isSimulator()) {
        log.debug('Setting the requested permissions before WDA is started');
        for (const [bundleId, permissionsMapping] of _.toPairs(JSON.parse(this.opts.permissions))) {
          await this.opts.device.setPermissions(bundleId, permissionsMapping);
        }
      } else {
        log.warn('Setting permissions is only supported on Simulator. ' +
          'The "permissions" capability will be ignored.');
      }
    }

    await this.startWda(this.opts.sessionId, realDevice);

    await this.setReduceMotion(this.opts.reduceMotion);

    await this.setInitialOrientation(this.opts.orientation);
    this.logEvent('orientationSet');

    // real devices will be handled later, after the web context has been initialized
    if (this.isSafari() && !this.isRealDevice() && util.compareVersions(this.opts.platformVersion, '>=', '12.2')) {
      // on 12.2 the page is not opened in WDA
      await openUrl(this.opts.device.udid, this._currentUrl);
    }

    if (this.isSafari() || this.opts.autoWebview) {
      log.debug('Waiting for initial webview');
      await this.navToInitialWebview();
      this.logEvent('initialWebviewNavigated');
    }

    if (this.isSafari() && this.isRealDevice() && util.compareVersions(this.opts.platformVersion, '>=', '12.2')) {
      // on 12.2 the page is not opened in WDA
      await this.setUrl(this._currentUrl);
    }

    if (!this.isRealDevice()) {
      if (this.opts.calendarAccessAuthorized) {
        await this.opts.device.enableCalendarAccess(this.opts.bundleId);
      } else if (this.opts.calendarAccessAuthorized === false) {
        await this.opts.device.disableCalendarAccess(this.opts.bundleId);
      }
    }
  }

  /**
   * Start WebDriverAgentRunner
   * @param {string} sessionId - The id of the target session to launch WDA with.
   * @param {boolean} realDevice - Equals to true if the test target device is a real device.
   */
  async startWda (sessionId, realDevice) {
    this.wda = new WebDriverAgent(this.xcodeVersion, this.opts);

    // Don't cleanup the processes if webDriverAgentUrl is set
    if (!util.hasValue(this.wda.webDriverAgentUrl)) {
      await this.wda.cleanupObsoleteProcesses();
    }

    const usePortForwarding = this.isRealDevice()
      && !this.wda.webDriverAgentUrl
      && isLocalHost(this.wda.wdaBaseUrl);
    await DEVICE_CONNECTIONS_FACTORY.requestConnection(this.opts.udid, this.wda.url.port, {
      devicePort: this.wda.wdaRemotePort,
      usePortForwarding,
    });

    // Let multiple WDA binaries with different derived data folders be built in parallel
    // Concurrent WDA builds from the same source will cause xcodebuild synchronization errors
    let synchronizationKey = XCUITestDriver.name;
    if (this.opts.useXctestrunFile || !(await this.wda.isSourceFresh())) {
      // First-time compilation is an expensive operation, which is done faster if executed
      // sequentially. Xcodebuild spreads the load caused by the clang compiler to all available CPU cores
      const derivedDataPath = await this.wda.retrieveDerivedDataPath();
      if (derivedDataPath) {
        synchronizationKey = path.normalize(derivedDataPath);
      }
    }
    log.debug(`Starting WebDriverAgent initialization with the synchronization key '${synchronizationKey}'`);
    if (SHARED_RESOURCES_GUARD.isBusy() && !this.opts.derivedDataPath && !this.opts.bootstrapPath) {
      log.debug(`Consider setting a unique 'derivedDataPath' capability value for each parallel driver instance ` +
        `to avoid conflicts and speed up the building process`);
    }
    return await SHARED_RESOURCES_GUARD.acquire(synchronizationKey, async () => {
      if (this.opts.useNewWDA) {
        log.debug(`Capability 'useNewWDA' set to true, so uninstalling WDA before proceeding`);
        await this.wda.quitAndUninstall();
        this.logEvent('wdaUninstalled');
      } else if (!util.hasValue(this.wda.webDriverAgentUrl)) {
        await this.wda.setupCaching();
      }

      // local helper for the two places we need to uninstall wda and re-start it
      const quitAndUninstall = async (msg) => {
        log.debug(msg);
        if (this.opts.webDriverAgentUrl) {
          log.debug('Not quitting/uninstalling WebDriverAgent since webDriverAgentUrl capability is provided');
          throw new Error(msg);
        }
        log.warn('Quitting and uninstalling WebDriverAgent');
        await this.wda.quitAndUninstall();

        throw new Error(msg);
      };

      const startupRetries = this.opts.wdaStartupRetries || (this.isRealDevice() ? WDA_REAL_DEV_STARTUP_RETRIES : WDA_SIM_STARTUP_RETRIES);
      const startupRetryInterval = this.opts.wdaStartupRetryInterval || WDA_STARTUP_RETRY_INTERVAL;
      log.debug(`Trying to start WebDriverAgent ${startupRetries} times with ${startupRetryInterval}ms interval`);
      if (!util.hasValue(this.opts.wdaStartupRetries) && !util.hasValue(this.opts.wdaStartupRetryInterval)) {
        log.debug(`These values can be customized by changing wdaStartupRetries/wdaStartupRetryInterval capabilities`);
      }
      let retryCount = 0;
      await retryInterval(startupRetries, startupRetryInterval, async () => {
        this.logEvent('wdaStartAttempted');
        if (retryCount > 0) {
          log.info(`Retrying WDA startup (${retryCount + 1} of ${startupRetries})`);
        }
        try {
          // on xcode 10 installd will often try to access the app from its staging
          // directory before fully moving it there, and fail. Retrying once
          // immediately helps
          const retries = this.xcodeVersion.major >= 10 ? 2 : 1;
          this.cachedWdaStatus = await retry(retries, this.wda.launch.bind(this.wda), sessionId, realDevice);
        } catch (err) {
          this.logEvent('wdaStartFailed');
          retryCount++;
          let errorMsg = `Unable to launch WebDriverAgent because of xcodebuild failure: ${err.message}`;
          if (this.isRealDevice()) {
            errorMsg += `. Make sure you follow the tutorial at ${WDA_REAL_DEV_TUTORIAL_URL}. ` +
                        `Try to remove the WebDriverAgentRunner application from the device if it is installed ` +
                        `and reboot the device.`;
          }
          await quitAndUninstall(errorMsg);
        }

        this.proxyReqRes = this.wda.proxyReqRes.bind(this.wda);
        this.jwpProxyActive = true;

        let originalStacktrace = null;
        try {
          await retryInterval(15, 1000, async () => {
            this.logEvent('wdaSessionAttempted');
            log.debug('Sending createSession command to WDA');
            try {
              this.cachedWdaStatus = this.cachedWdaStatus || await this.proxyCommand('/status', 'GET');
              await this.startWdaSession(this.opts.bundleId, this.opts.processArguments);
            } catch (err) {
              originalStacktrace = err.stack;
              log.debug(`Failed to create WDA session (${err.message}). Retrying...`);
              throw err;
            }
          });
          this.logEvent('wdaSessionStarted');
        } catch (err) {
          if (originalStacktrace) {
            log.debug(originalStacktrace);
          }
          let errorMsg = `Unable to start WebDriverAgent session because of xcodebuild failure: ${err.message}`;
          if (this.isRealDevice()) {
            errorMsg += ` Make sure you follow the tutorial at ${WDA_REAL_DEV_TUTORIAL_URL}. ` +
                        `Try to remove the WebDriverAgentRunner application from the device if it is installed ` +
                        `and reboot the device.`;
          }
          await quitAndUninstall(errorMsg);
        }

        if (this.opts.clearSystemFiles && !this.opts.webDriverAgentUrl) {
          await markSystemFilesForCleanup(this.wda);
        }

        // we expect certain socket errors until this point, but now
        // mark things as fully working
        this.wda.fullyStarted = true;
        this.logEvent('wdaStarted');
      });
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
    await removeAllSessionWebSocketHandlers(this.server, this.sessionId);

    if (this.isSimulator() && (this.opts.device || {}).idb) {
      await this.opts.device.idb.disconnect();
      this.opts.device.idb = null;
    }

    await this.stop();

    if (this.opts.clearSystemFiles && this.isAppTemporary) {
      await fs.rimraf(this.opts.app);
    }

    if (this.wda && !this.opts.webDriverAgentUrl) {
      if (this.opts.clearSystemFiles) {
        let synchronizationKey = XCUITestDriver.name;
        const derivedDataPath = await this.wda.retrieveDerivedDataPath();
        if (derivedDataPath) {
          synchronizationKey = path.normalize(derivedDataPath);
        }
        await SHARED_RESOURCES_GUARD.acquire(synchronizationKey, async () => {
          await clearSystemFiles(this.wda);
        });
      } else {
        log.debug('Not clearing log files. Use `clearSystemFiles` capability to turn on.');
      }
    }

    if (this.isWebContext()) {
      log.debug('In a web session. Removing remote debugger');
      await this.stopRemote();
    }

    if (this.opts.resetOnSessionStartOnly === false) {
      await this.runReset(Object.assign({}, this.opts, {
        enforceSimulatorShutdown: true,
      }));
    }

    if (this.isSimulator() && !this.opts.noReset && !!this.opts.device) {
      if (this.lifecycleData.createSim) {
        log.debug(`Deleting simulator created for this run (udid: '${this.opts.udid}')`);
        await shutdownSimulator(this.opts.device);
        await this.opts.device.delete();
      }
    }

    if (!_.isEmpty(this.logs)) {
      await this.logs.syslog.stopCapture();
      this.logs = {};
    }

    if (this.opts.enableAsyncExecuteFromHttps && !this.isRealDevice()) {
      await this.stopHttpsAsyncServer();
    }

    if (this.mjpegStream) {
      log.info('Closing MJPEG stream');
      this.mjpegStream.stop();
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
      if (!this.wda.webDriverAgentUrl && this.opts.useNewWDA) {
        await this.wda.quit();
      }
    }

    DEVICE_CONNECTIONS_FACTORY.releaseConnection(this.opts.udid);
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

    const originalAppPath = this.opts.app;
    try {
      // download if necessary
      this.opts.app = await this.helpers.configureApp(this.opts.app, '.app');
    } catch (err) {
      log.error(err);
      throw new Error(`Bad app: ${this.opts.app}. App paths need to be absolute or an URL to a compressed app file${err && err.message ? `: ${err.message}` : ''}`);
    }
    this.isAppTemporary = this.opts.app && await fs.exists(this.opts.app)
      && !await util.isSameDestination(originalAppPath, this.opts.app);
  }

  async determineDevice () {
    // in the one case where we create a sim, we will set this state
    this.lifecycleData.createSim = false;

    // if we get generic names, translate them
    this.opts.deviceName = translateDeviceName(this.opts.platformVersion, this.opts.deviceName);

    const setupVersionCaps = async () => {
      this.opts.iosSdkVersion = await getAndCheckIosSdkVersion();
      log.info(`iOS SDK Version set to '${this.opts.iosSdkVersion}'`);
      if (!this.opts.platformVersion && this.opts.iosSdkVersion) {
        log.info(`No platformVersion specified. Using the latest version Xcode supports: '${this.opts.iosSdkVersion}'. ` +
          `This may cause problems if a simulator does not exist for this platform version.`);
        this.opts.platformVersion = normalizePlatformVersion(this.opts.iosSdkVersion);
      }
    };

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
          const devicePlatform = normalizePlatformVersion(await device.getPlatformVersion());
          if (this.opts.platformVersion !== devicePlatform) {
            this.opts.platformVersion = devicePlatform;
            log.info(`Set platformVersion to '${devicePlatform}' to match the device with given UDID`);
          }
          await setupVersionCaps();
          return {device, realDevice: false, udid: device.udid};
        }
      } else {
        // make sure it is a connected device. If not, the udid passed in is invalid
        const devices = await getConnectedDevices();
        log.debug(`Available devices: ${devices.join(', ')}`);
        if (!devices.includes(this.opts.udid)) {
          // check for a particular simulator
          if (await simExists(this.opts.udid)) {
            const device = await getSimulator(this.opts.udid);
            return {device, realDevice: false, udid: this.opts.udid};
          }

          throw new Error(`Unknown device or simulator UDID: '${this.opts.udid}'`);
        }
      }

      const device = await getRealDeviceObj(this.opts.udid);
      if (_.isEmpty(this.opts.platformVersion)) {
        log.info('Getting the platformVersion from the phone since it was not specified in the capabilities');
        try {
          const osVersion = await getOSVersion(this.opts.udid);
          this.opts.platformVersion = util.coerceVersion(osVersion);
        } catch (e) {
          log.warn(`Cannot determine real device platform version. Original error: ${e.message}`);
        }
      }
      return {device, realDevice: true, udid: this.opts.udid};
    }

    // Now we know for sure the device will be a Simulator
    await setupVersionCaps();
    if (this.opts.enforceFreshSimulatorCreation) {
      log.debug(`New simulator is requested. If this is not wanted, set 'enforceFreshSimulatorCreation' capability to false`);
    } else {
      // figure out the correct simulator to use, given the desired capabilities
      const device = await getExistingSim(this.opts);

      // check for an existing simulator
      if (device) {
        return {device, realDevice: false, udid: device.udid};
      }

      log.info('Simulator udid not provided');
    }

    // no device of this type exists, or they request new sim, so create one
    log.info('Using desired caps to create a new simulator');
    const device = await this.createSim();
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

    // Get platform name from const since it must be case sensitive to create a new simulator
    const platformName = isTvOS(this.opts.platformName) ? PLATFORM_NAME_TVOS : PLATFORM_NAME_IOS;

    // create sim for caps
    let sim = await createSim(this.opts, platformName);
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
    let eventloopIdleDelaySec = this.opts.wdaEventloopIdleDelay || 0;
    if (util.hasValue(this.opts.simpleIsVisibleCheck)) {
      shouldUseTestManagerForVisibilityDetection = this.opts.simpleIsVisibleCheck;
    }
    if (util.compareVersions(this.opts.platformVersion, '==', '9.3')) {
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

    const wdaCaps = {
      bundleId: this.opts.autoLaunch === false ? undefined : bundleId,
      arguments: args,
      environment: env,
      eventloopIdleDelaySec,
      shouldWaitForQuiescence,
      shouldUseTestManagerForVisibilityDetection,
      maxTypingFrequency,
      shouldUseSingletonTestManager,
    };
    if (util.hasValue(this.opts.shouldUseCompactResponses)) {
      wdaCaps.shouldUseCompactResponses = this.opts.shouldUseCompactResponses;
    }
    if (util.hasValue(this.opts.elementResponseFields)) {
      wdaCaps.elementResponseFields = this.opts.elementResponseFields;
    }
    if (this.opts.autoAcceptAlerts) {
      wdaCaps.defaultAlertAction = 'accept';
    } else if (this.opts.autoDismissAlerts) {
      wdaCaps.defaultAlertAction = 'dismiss';
    }

    await this.proxyCommand('/session', 'POST', {
      capabilities: {
        firstMatch: [wdaCaps],
        alwaysMatch: {},
      }
    });
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
    if (!super.validateDesiredCaps(caps)) {
      return false;
    }

    // make sure that the capabilities have one of `app` or `bundleId`
    if ((caps.browserName || '').toLowerCase() !== 'safari' && !caps.app && !caps.bundleId) {
      let msg = 'The desired capabilities must include either an app or a bundleId for iOS';
      log.errorAndThrow(msg);
    }

    if (!util.coerceVersion(caps.platformVersion, false)) {
      log.warn(`'platformVersion' capability ('${caps.platformVersion}') is not a valid version number. ` +
        `Consider fixing it or be ready to experience an inconsistent driver behavior.`);
    }

    let verifyProcessArgument = (processArguments) => {
      const {args, env} = processArguments;
      if (!_.isNil(args) && !_.isArray(args)) {
        log.errorAndThrow('processArguments.args must be an array of strings');
      }
      if (!_.isNil(env) && !_.isPlainObject(env)) {
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
          log.errorAndThrow(`processArguments must be a json format or an object with format {args : [], env : {a:b, c:d}}. ` +
            `Both environment and argument can be null. Error: ${err}`);
        }
      } else if (_.isPlainObject(caps.processArguments)) {
        verifyProcessArgument(caps.processArguments);
      } else {
        log.errorAndThrow(`'processArguments must be an object, or a string JSON object with format {args : [], env : {a:b, c:d}}. ` +
          `Both environment and argument can be null.`);
      }
    }

    // there is no point in having `keychainPath` without `keychainPassword`
    if ((caps.keychainPath && !caps.keychainPassword) || (!caps.keychainPath && caps.keychainPassword)) {
      log.errorAndThrow(`If 'keychainPath' is set, 'keychainPassword' must also be set (and vice versa).`);
    }

    // `resetOnSessionStartOnly` should be set to true by default
    this.opts.resetOnSessionStartOnly = !util.hasValue(this.opts.resetOnSessionStartOnly) || this.opts.resetOnSessionStartOnly;
    this.opts.useNewWDA = util.hasValue(this.opts.useNewWDA) ? this.opts.useNewWDA : false;

    if (caps.commandTimeouts) {
      caps.commandTimeouts = normalizeCommandTimeouts(caps.commandTimeouts);
    }

    if (_.isString(caps.webDriverAgentUrl)) {
      const {protocol, host} = url.parse(caps.webDriverAgentUrl);
      if (_.isEmpty(protocol) || _.isEmpty(host)) {
        log.errorAndThrow(`'webDriverAgentUrl' capability is expected to contain a valid WebDriverAgent server URL. ` +
                          `'${caps.webDriverAgentUrl}' is given instead`);
      }
    }

    if (caps.browserName) {
      if (caps.bundleId) {
        log.errorAndThrow(`'browserName' cannot be set together with 'bundleId' capability`);
      }
      // warn if the capabilities have both `app` and `browser, although this
      // is common with selenium grid
      if (caps.app) {
        log.warn(`The capabilities should generally not include both an 'app' and a 'browserName'`);
      }
    }

    if (caps.permissions) {
      try {
        for (const [bundleId, perms] of _.toPairs(JSON.parse(caps.permissions))) {
          if (!_.isString(bundleId)) {
            throw new Error(`'${JSON.stringify(bundleId)}' must be a string`);
          }
          if (!_.isPlainObject(perms)) {
            throw new Error(`'${JSON.stringify(perms)}' must be a JSON object`);
          }
        }
      } catch (e) {
        log.errorAndThrow(`'${caps.permissions}' is expected to be a valid object with format ` +
          `{"<bundleId1>": {"<serviceName1>": "<serviceStatus1>", ...}, ...}. Original error: ${e.message}`);
      }
    }

    if (caps.platformVersion && !util.coerceVersion(caps.platformVersion, false)) {
      log.errorAndThrow(`'platformVersion' must be a valid version number. ` +
        `'${caps.platformVersion}' is given instead.`);
    }

    // finally, return true since the superclass check passed, as did this
    return true;
  }

  async installAUT () {
    if (this.isSafari()) {
      return;
    }

    try {
      await verifyApplicationPlatform(this.opts.app, this.isSimulator(), isTvOS(this.opts.platformName));
    } catch (err) {
      // TODO: Let it throw after we confirm the architecture verification algorithm is stable
      log.warn(`*********************************`);
      log.warn(`${this.isSimulator() ? 'Simulator' : 'Real device'} architecture appears to be unsupported ` +
               `by the '${this.opts.app}' application. ` +
               `Make sure the correct deployment target has been selected for its compilation in Xcode.`);
      log.warn('Don\'t be surprised if the application fails to launch.');
      log.warn(`*********************************`);
    }

    if (this.isRealDevice()) {
      await installToRealDevice(this.opts.device, this.opts.app, this.opts.bundleId, this.opts.noReset);
    } else {
      await installToSimulator(this.opts.device, this.opts.app, this.opts.bundleId, this.opts.noReset);
    }
    if (this.opts.otherApps) {
      await this.installOtherApps(this.opts.otherApps);
    }

    if (util.hasValue(this.opts.iosInstallPause)) {
      // https://github.com/appium/appium/issues/6889
      let pause = parseInt(this.opts.iosInstallPause, 10);
      log.debug(`iosInstallPause set. Pausing ${pause} ms before continuing`);
      await B.delay(pause);
    }
  }

  async installOtherApps (otherApps) {
    if (this.isRealDevice()) {
      log.warn('Capability otherApps is only supported for Simulators');
      return;
    }
    try {
      otherApps = this.helpers.parseCapsArray(otherApps);
    } catch (e) {
      log.errorAndThrow(`Could not parse "otherApps" capability: ${e.message}`);
    }
    for (const otherApp of otherApps) {
      await installToSimulator(this.opts.device, otherApp, undefined, this.opts.noReset);
    }
  }

  /**
   * Set reduceMotion as 'isEnabled' only when the capabilities has 'reduceMotion'
   * The call is ignored for real devices.
   * @param {?boolean} isEnabled Wether enable reduceMotion
   */
  async setReduceMotion (isEnabled) {
    if (this.isRealDevice() || !_.isBoolean(isEnabled)) {
      return;
    }

    log.info(`Setting reduceMotion to ${isEnabled}`);
    await this.updateSettings({reduceMotion: isEnabled});
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
    const driverSession = await super.getSession();
    if (!this.wdaCaps) {
      this.wdaCaps = await this.proxyCommand('/', 'GET');
    }
    if (!this.deviceCaps) {
      const {statusBarSize, scale} = await this.getScreenInfo();
      this.deviceCaps = {
        pixelRatio: scale,
        statBarHeight: statusBarSize.height,
        viewportRect: await this.getViewportRect(),
      };
    }
    log.info('Merging WDA caps over Appium caps for session detail response');
    return Object.assign({udid: this.opts.udid}, driverSession,
      this.wdaCaps.capabilities, this.deviceCaps);
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
