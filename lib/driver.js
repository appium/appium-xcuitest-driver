import { BaseDriver, DeviceSettings } from 'appium/driver';
import { util, mjpeg, fs } from 'appium/support';
import _ from 'lodash';
import url from 'url';
import { WebDriverAgent } from 'appium-webdriveragent';
import LRU from 'lru-cache';
import {
  createSim, getExistingSim, runSimulatorReset, installToSimulator,
  shutdownOtherSimulators, shutdownSimulator, setSafariPrefs, setLocalizationPrefs
} from './simulator-management';
import { getSimulator } from 'appium-ios-simulator';
import { retryInterval, retry } from 'asyncbox';
import {
  verifyApplicationPlatform, extractBundleId, SAFARI_BUNDLE_ID,
  fetchSupportedAppPlatforms, APP_EXT, IPA_EXT,
  isAppBundle, findApps, isolateAppBundle,
} from './app-utils';
import {
  desiredCapConstraints, PLATFORM_NAME_IOS, PLATFORM_NAME_TVOS
} from './desired-caps';
import commands from './commands/index';
import {
  detectUdid, getAndCheckXcodeVersion, getAndCheckIosSdkVersion,
  checkAppPresent, getDriverInfo,
  clearSystemFiles, translateDeviceName, normalizeCommandTimeouts,
  DEFAULT_TIMEOUT_KEY, markSystemFilesForCleanup,
  printUser, removeAllSessionWebSocketHandlers,
  normalizePlatformVersion, isLocalHost
} from './utils';
import {
  getConnectedDevices, runRealDeviceReset, installToRealDevice,
  getRealDeviceObj
} from './real-device-management';
import B from 'bluebird';
import AsyncLock from 'async-lock';
import path from 'path';
import IDB from 'appium-idb';
import DEVICE_CONNECTIONS_FACTORY from './device-connections-factory';
import Pyidevice from './py-ios-device-client';


const SHUTDOWN_OTHER_FEAT_NAME = 'shutdown_other_sims';
const CUSTOMIZE_RESULT_BUNDPE_PATH = 'customize_result_bundle_path';

const SUPPORTED_EXTENSIONS = [IPA_EXT, APP_EXT];
const MAX_ARCHIVE_SCAN_DEPTH = 1;
const defaultServerCaps = {
  webStorageEnabled: false,
  locationContextEnabled: false,
  browserName: '',
  platform: 'MAC',
  javascriptEnabled: true,
  databaseEnabled: false,
  takesScreenshot: true,
  networkConnectionEnabled: false,
};
const WDA_SIM_STARTUP_RETRIES = 2;
const WDA_REAL_DEV_STARTUP_RETRIES = 1;
const WDA_REAL_DEV_TUTORIAL_URL = 'https://github.com/appium/appium-xcuitest-driver/blob/master/docs/real-device-config.md';
const WDA_STARTUP_RETRY_INTERVAL = 10000;
const DEFAULT_SETTINGS = {
  nativeWebTap: false,
  nativeWebTapStrict: false,
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
const WEB_ELEMENTS_CACHE_SIZE = 500;
const SUPPORTED_ORIENATIONS = ['LANDSCAPE', 'PORTRAIT'];
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
  ['DELETE', /cookie/],
  ['GET', /cookie/],
  ['POST', /cookie/],
];
const NO_PROXY_WEB_LIST = [
  ['GET', /attribute/],
  ['GET', /element/],
  ['GET', /text/],
  ['GET', /title/],
  ['POST', /clear/],
  ['POST', /click/],
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
      'accessibility id',
      'css selector',
    ];
    this.webLocatorStrategies = [
      'link text',
      'css selector',
      'tag name',
      'link text',
      'partial link text',
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
    if (key !== 'nativeWebTap' && key !== 'nativeWebTapStrict') {
      return await this.proxyCommand('/appium/settings', 'POST', {
        settings: {[key]: value}
      });
    }
    this.opts[key] = !!value;
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

    this.curWebFrames = [];
    this._currentUrl = null;
    this.curContext = null;
    this.xcodeVersion = {};
    this.contexts = [];
    this.implicitWaitMs = 0;
    this.asynclibWaitMs = 0;
    this.pageLoadMs = 6000;
    this.landscapeWebCoordsOffset = 0;
    this.remote = null;
    this._conditionInducerService = null;

    this.webElementsCache = new LRU({
      max: WEB_ELEMENTS_CACHE_SIZE,
    });
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

  mergeCliArgsToOpts () {
    let didMerge = false;
    // this.cliArgs should never include anything we do not expect.
    for (const [key, value] of Object.entries(this.cliArgs ?? {})) {
      if (_.has(this.opts, key)) {
        this.log.info(`CLI arg '${key}' with value '${value}' overwrites value '${this.opts[key]}' sent in via caps)`);
        didMerge = true;
      }
      this.opts[key] = value;
    }
    return didMerge;
  }

  async createSession (...args) {
    this.lifecycleData = {}; // this is used for keeping track of the state we start so when we delete the session we can put things back
    try {
      let [sessionId, caps] = await super.createSession(...args);
      this.opts.sessionId = sessionId;

      // merge cli args to opts, and if we did merge any, revalidate opts to ensure the final set
      // is also consistent
      if (this.mergeCliArgsToOpts()) {
        this.validateDesiredCaps({...caps, ...this.cliArgs});
      }

      await this.start();

      // merge server capabilities + desired capabilities
      caps = Object.assign({}, defaultServerCaps, caps);
      // update the udid with what is actually used
      caps.udid = this.opts.udid;
      // ensure we track nativeWebTap capability as a setting as well
      if (_.has(this.opts, 'nativeWebTap')) {
        await this.updateSettings({nativeWebTap: this.opts.nativeWebTap});
      }
      // ensure we track nativeWebTapStrict capability as a setting as well
      if (_.has(this.opts, 'nativeWebTapStrict')) {
        await this.updateSettings({nativeWebTapStrict: this.opts.nativeWebTapStrict});
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
        this.log.info(`Setting the quality of phone screenshot: '${this.opts.screenshotQuality}'`);
        wdaSettings.screenshotQuality = this.opts.screenshotQuality;
      }
      // ensure WDA gets our defaults instead of whatever its own might be
      await this.updateSettings(wdaSettings);

      // turn on mjpeg stream reading if requested
      if (this.opts.mjpegScreenshotUrl) {
        this.log.info(`Starting MJPEG stream reading URL: '${this.opts.mjpegScreenshotUrl}'`);
        this.mjpegStream = new mjpeg.MJpegStream(this.opts.mjpegScreenshotUrl);
        await this.mjpegStream.start();
      }
      return [sessionId, caps];
    } catch (e) {
      this.log.error(JSON.stringify(e));
      await this.deleteSession();
      throw e;
    }
  }

  /**
   * Returns the default URL for Safari browser
   * @returns {string} The default URL
   */
  getDefaultUrl () {
    // Setting this to some external URL slows down Appium startup
    return this.isRealDevice()
      ? `http://127.0.0.1:${this.opts.wdaLocalPort || 8100}/health`
      : `http://${
        this.opts.address.includes(':') ? `[${this.opts.address}]` : this.opts.address
      }:${this.opts.port}/welcome`;
  }

  async start () {
    this.opts.noReset = !!this.opts.noReset;
    this.opts.fullReset = !!this.opts.fullReset;

    await printUser();

    this.opts.iosSdkVersion = null; // For WDA and xcodebuild
    const {device, udid, realDevice} = await this.determineDevice();
    this.log.info(`Determining device to run tests on: udid: '${udid}', real device: ${realDevice}`);
    this.opts.device = device;
    this.opts.udid = udid;
    this.opts.realDevice = realDevice;

    if (this.opts.simulatorDevicesSetPath) {
      if (realDevice) {
        this.log.info(`The 'simulatorDevicesSetPath' capability is only supported for Simulator devices`);
      } else {
        this.log.info(`Setting simulator devices set path to '${this.opts.simulatorDevicesSetPath}'`);
        this.opts.device.devicesSetPath = this.opts.simulatorDevicesSetPath;
      }
    }

    // at this point if there is no platformVersion, get it from the device
    if (!this.opts.platformVersion && this.opts.device) {
      this.opts.platformVersion = await this.opts.device.getPlatformVersion();
      this.log.info(`No platformVersion specified. Using device version: '${this.opts.platformVersion}'`);
    }

    const normalizedVersion = normalizePlatformVersion(this.opts.platformVersion);
    if (this.opts.platformVersion !== normalizedVersion) {
      this.log.info(`Normalized platformVersion capability value '${this.opts.platformVersion}' to '${normalizedVersion}'`);
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

    if (_.toLower(this.opts.browserName) === 'safari') {
      this.log.info('Safari test requested');
      this.safari = true;
      this.opts.app = undefined;
      this.opts.processArguments = this.opts.processArguments || {};
      this.opts.bundleId = SAFARI_BUNDLE_ID;
      this._currentUrl = this.opts.safariInitialUrl || this.getDefaultUrl();
    } else if (this.opts.app || this.opts.bundleId) {
      await this.configureApp();
    }
    this.logEvent('appConfigured');

    // fail very early if the app doesn't actually exist
    // or if bundle id doesn't point to an installed app
    if (this.opts.app) {
      await checkAppPresent(this.opts.app);

      if (!this.opts.bundleId) {
        this.opts.bundleId = await extractBundleId(this.opts.app);
      }
    }

    await this.runReset();

    this.wda = new WebDriverAgent(this.xcodeVersion, this.opts, this.log);
    // Derived data path retrieval is an expensive operation
    // We could start that now in background and get the cached result
    // whenever it is needed
    // eslint-disable-next-line promise/prefer-await-to-then
    this.wda.retrieveDerivedDataPath().catch((e) => this.log.debug(e));

    const memoizedLogInfo = _.memoize(() => {
      this.log.info("'skipLogCapture' is set. Skipping starting logs such as crash, system, safari console and safari network.");
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

    this.log.info(`Setting up ${this.isRealDevice() ? 'real device' : 'simulator'}`);

    if (this.isSimulator()) {
      if (this.opts.shutdownOtherSimulators) {
        this.ensureFeatureEnabled(SHUTDOWN_OTHER_FEAT_NAME);
        await shutdownOtherSimulators(this.opts.device);
      }

      await this.startSim();

      if (this.opts.customSSLCert) {
        // Simulator must be booted in order to call this helper
        await this.opts.device.addCertificate(this.opts.customSSLCert);
        this.logEvent('customCertInstalled');
      }

      if (await setSafariPrefs(this.opts.device, this.opts)) {
        this.log.debug('Safari preferences have been updated');
      }

      if (await setLocalizationPrefs(this.opts.device, this.opts)) {
        this.log.debug('Localization preferences have been updated');
      }

      if (_.isBoolean(this.opts.reduceMotion)) {
        this.log.info(`Setting reduceMotion to ${this.opts.reduceMotion}`);
        await this.opts.device.setReduceMotion(this.opts.reduceMotion);
      }

      if (_.isBoolean(this.opts.reduceTransparency)) {
        this.log.info(`Setting reduceTransparency to ${this.opts.reduceTransparency}`);
        await this.opts.device.setReduceTransparency(this.opts.reduceTransparency);
      }

      if (this.opts.launchWithIDB) {
        try {
          const idb = new IDB({udid});
          await idb.connect();
          this.opts.device.idb = idb;
        } catch (e) {
          this.log.debug(e.stack);
          this.log.warn(`idb will not be used for Simulator interaction. Original error: ${e.message}`);
        }
      }

      this.logEvent('simStarted');
      if (!isLogCaptureStarted) {
        // Retry log capture if Simulator was not running before
        await startLogCapture();
      }
    } else if (this.opts.customSSLCert) {
      await new Pyidevice(udid).installProfile({payload: this.opts.customSSLCert});
      this.logEvent('customCertInstalled');
    }

    if (this.opts.app) {
      await this.installAUT();
      this.logEvent('appInstalled');
    }

    // if we only have bundle identifier and no app, fail if it is not already installed
    if (!this.opts.app && this.opts.bundleId && !this.isSafari()
        && !await this.opts.device.isAppInstalled(this.opts.bundleId)) {
      this.log.errorAndThrow(`App with bundle identifier '${this.opts.bundleId}' unknown`);
    }

    if (this.isSimulator()) {
      if (this.opts.permissions) {
        this.log.debug('Setting the requested permissions before WDA is started');
        for (const [bundleId, permissionsMapping] of _.toPairs(JSON.parse(this.opts.permissions))) {
          await this.opts.device.setPermissions(bundleId, permissionsMapping);
        }
      }

      // TODO: Deprecate and remove this block together with calendarAccessAuthorized capability
      if (_.isBoolean(this.opts.calendarAccessAuthorized)) {
        this.log.warn(`The 'calendarAccessAuthorized' capability is deprecated and will be removed soon. ` +
          `Consider using 'permissions' one instead with 'calendar' key`);
        const methodName = `${this.opts.calendarAccessAuthorized ? 'enable' : 'disable' }CalendarAccess`;
        await this.opts.device[methodName](this.opts.bundleId);
      }
    }

    await this.startWda(this.opts.sessionId, realDevice);

    if (this.opts.orientation) {
      await this.setInitialOrientation(this.opts.orientation);
      this.logEvent('orientationSet');
    }

    if (this.isSafari() || this.opts.autoWebview) {
      await this.activateRecentWebview();
    }
    if (this.isSafari()) {
      if (!(this.opts.safariInitialUrl === ''
          || (this.opts.noReset && _.isNil(this.opts.safariInitialUrl)))) {
        this.log.info(`About to set the initial Safari URL to '${this.getCurrentUrl()}'.` +
          `Use 'safariInitialUrl' capability in order to customize it`);
        await this.setUrl(this.getCurrentUrl());
      } else {
        this.setCurrentUrl(await this.getUrl());
      }
    }
  }

  /**
   * Start WebDriverAgentRunner
   * @param {string} sessionId - The id of the target session to launch WDA with.
   * @param {boolean} realDevice - Equals to true if the test target device is a real device.
   */
  async startWda (sessionId, realDevice) {
    // Don't cleanup the processes if webDriverAgentUrl is set
    if (!util.hasValue(this.wda.webDriverAgentUrl)) {
      await this.wda.cleanupObsoleteProcesses();
    }

    const usePortForwarding = this.isRealDevice()
      && !this.wda.webDriverAgentUrl
      && isLocalHost(this.wda.wdaBaseUrl);
    await DEVICE_CONNECTIONS_FACTORY.requestConnection(this.opts.udid, this.wda.url.port, {
      devicePort: usePortForwarding ? this.wda.wdaRemotePort : null,
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
    this.log.debug(`Starting WebDriverAgent initialization with the synchronization key '${synchronizationKey}'`);
    if (SHARED_RESOURCES_GUARD.isBusy() && !this.opts.derivedDataPath && !this.opts.bootstrapPath) {
      this.log.debug(`Consider setting a unique 'derivedDataPath' capability value for each parallel driver instance ` +
        `to avoid conflicts and speed up the building process`);
    }
    return await SHARED_RESOURCES_GUARD.acquire(synchronizationKey, async () => {
      if (this.opts.useNewWDA) {
        this.log.debug(`Capability 'useNewWDA' set to true, so uninstalling WDA before proceeding`);
        await this.wda.quitAndUninstall();
        this.logEvent('wdaUninstalled');
      } else if (!util.hasValue(this.wda.webDriverAgentUrl)) {
        await this.wda.setupCaching();
      }

      // local helper for the two places we need to uninstall wda and re-start it
      const quitAndUninstall = async (msg) => {
        this.log.debug(msg);
        if (this.opts.webDriverAgentUrl) {
          this.log.debug('Not quitting/uninstalling WebDriverAgent since webDriverAgentUrl capability is provided');
          throw new Error(msg);
        }
        this.log.warn('Quitting and uninstalling WebDriverAgent');
        await this.wda.quitAndUninstall();

        throw new Error(msg);
      };

      // Used in the following WDA build
      if (this.opts.resultBundlePath) {
        this.ensureFeatureEnabled(CUSTOMIZE_RESULT_BUNDPE_PATH);
      }

      const startupRetries = this.opts.wdaStartupRetries || (this.isRealDevice() ? WDA_REAL_DEV_STARTUP_RETRIES : WDA_SIM_STARTUP_RETRIES);
      const startupRetryInterval = this.opts.wdaStartupRetryInterval || WDA_STARTUP_RETRY_INTERVAL;
      this.log.debug(`Trying to start WebDriverAgent ${startupRetries} times with ${startupRetryInterval}ms interval`);
      if (!util.hasValue(this.opts.wdaStartupRetries) && !util.hasValue(this.opts.wdaStartupRetryInterval)) {
        this.log.debug(`These values can be customized by changing wdaStartupRetries/wdaStartupRetryInterval capabilities`);
      }
      let retryCount = 0;
      await retryInterval(startupRetries, startupRetryInterval, async () => {
        this.logEvent('wdaStartAttempted');
        if (retryCount > 0) {
          this.log.info(`Retrying WDA startup (${retryCount + 1} of ${startupRetries})`);
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
            this.log.debug('Sending createSession command to WDA');
            try {
              this.cachedWdaStatus = this.cachedWdaStatus || await this.proxyCommand('/status', 'GET');
              await this.startWdaSession(this.opts.bundleId, this.opts.processArguments);
            } catch (err) {
              originalStacktrace = err.stack;
              this.log.debug(`Failed to create WDA session (${err.message}). Retrying...`);
              throw err;
            }
          });
          this.logEvent('wdaSessionStarted');
        } catch (err) {
          if (originalStacktrace) {
            this.log.debug(originalStacktrace);
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

    for (const recorder of _.compact([
      this._recentScreenRecorder, this._audioRecorder, this._trafficCapture
    ])) {
      await recorder.interrupt(true);
      await recorder.cleanup();
    }

    if (!_.isEmpty(this._perfRecorders)) {
      await B.all(this._perfRecorders.map((x) => x.stop(true)));
      this._perfRecorders = [];
    }

    if (this._conditionInducerService) {
      this.mobileDisableConditionInducer();
    }

    await this.stop();

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
        this.log.debug('Not clearing log files. Use `clearSystemFiles` capability to turn on.');
      }
    }

    if (this.remote) {
      this.log.debug('Found a remote debugger session. Removing...');
      await this.stopRemote();
    }

    if (this.opts.resetOnSessionStartOnly === false) {
      await this.runReset(Object.assign({}, this.opts, {
        enforceSimulatorShutdown: true,
      }));
    }

    if (this.isSimulator() && !this.opts.noReset && !!this.opts.device) {
      if (this.lifecycleData.createSim) {
        this.log.debug(`Deleting simulator created for this run (udid: '${this.opts.udid}')`);
        await shutdownSimulator(this.opts.device);
        await this.opts.device.delete();
      }
    }

    const shouldResetLocationServivce = this.isRealDevice() && !!this.opts.resetLocationService;
    if (shouldResetLocationServivce) {
      try {
        await this.mobileResetLocationService();
      } catch (ignore) { /* Ignore this error since mobileResetLocationService already logged the error */ }
    }

    if (!_.isEmpty(this.logs)) {
      await this.logs.syslog.stopCapture();
      this.logs = {};
    }

    if (this.mjpegStream) {
      this.log.info('Closing MJPEG stream');
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
          this.log.debug(`Unable to DELETE session on WDA: '${err.message}'. Continuing shutdown.`);
        }
      }
      if (!this.wda.webDriverAgentUrl && this.opts.useNewWDA) {
        await this.wda.quit();
      }
    }

    DEVICE_CONNECTIONS_FACTORY.releaseConnection(this.opts.udid);
  }

  async executeCommand (cmd, ...args) {
    this.log.debug(`Executing command '${cmd}'`);

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
      this.log.debug('App is an iOS bundle, will attempt to run as pre-existing');
      return;
    }

    // check for supported build-in apps
    switch (_.toLower(this.opts.app)) {
      case 'settings':
        this.opts.bundleId = 'com.apple.Preferences';
        this.opts.app = null;
        return;
      case 'calendar':
        this.opts.bundleId = 'com.apple.mobilecal';
        this.opts.app = null;
        return;
    }

    this.opts.app = await this.helpers.configureApp(this.opts.app, {
      onPostProcess: this.onPostConfigureApp.bind(this),
      supportedExtensions: SUPPORTED_EXTENSIONS
    });
  }

  /**
   * Unzip the given archive and find a matching .app bundle in it
   *
   * @param {string} appPath The path to the archive.
   * @param {number} depth [0] the current nesting depth. App bundles whose nesting level
   * is greater than 1 are not supported.
   * @returns {string} Full path to the first matching .app bundle..
   * @throws If no matching .app bundles were found in the provided archive.
   */
  async unzipApp (appPath, depth = 0) {
    if (depth > MAX_ARCHIVE_SCAN_DEPTH) {
      throw new Error('Nesting of package bundles is not supported');
    }
    const [rootDir, matchedPaths] = await findApps(appPath, SUPPORTED_EXTENSIONS);
    if (_.isEmpty(matchedPaths)) {
      this.log.debug(`'${path.basename(appPath)}' has no bundles`);
    } else {
      this.log.debug(
        `Found ${util.pluralize('bundle', matchedPaths.length, true)} in ` +
        `'${path.basename(appPath)}': ${matchedPaths}`
      );
    }
    try {
      for (const matchedPath of matchedPaths) {
        const fullPath = path.join(rootDir, matchedPath);
        if (await isAppBundle(fullPath)) {
          const supportedPlatforms = await fetchSupportedAppPlatforms(fullPath);
          if (this.isSimulator() && !supportedPlatforms.some((p) => _.includes(p, 'Simulator'))) {
            this.log.info(`'${matchedPath}' does not have Simulator devices in the list of supported platforms ` +
              `(${supportedPlatforms.join(',')}). Skipping it`);;
            continue;
          }
          if (this.isRealDevice() && !supportedPlatforms.some((p) => _.includes(p, 'OS'))) {
            this.log.info(`'${matchedPath}' does not have real devices in the list of supported platforms ` +
              `(${supportedPlatforms.join(',')}). Skipping it`);;
            continue;
          }
          this.log.info(`'${matchedPath}' is the resulting application bundle selected from '${appPath}'`);
          return await isolateAppBundle(fullPath);
        } else if (_.endsWith(_.toLower(fullPath), IPA_EXT) && (await fs.stat(fullPath)).isFile()) {
          try {
            return await this.unzipApp(fullPath, depth + 1);
          } catch (e) {
            this.log.warn(`Skipping processing of '${matchedPath}': ${e.message}`);
          }
        }
      }
    } finally {
      await fs.rimraf(rootDir);
    }
    throw new Error(`${this.opts.app} did not have any matching ${APP_EXT} or ${IPA_EXT} ` +
      `bundles. Please make sure the provided package is valid and contains at least one matching ` +
      `application bundle which is not nested.`
    );
  }

  async onPostConfigureApp ({cachedAppInfo, isUrl, appPath}) {
    // Pick the previously cached entry if its integrity has been preserved
    if (_.isPlainObject(cachedAppInfo)
        && (await fs.stat(appPath)).isFile()
        && await fs.hash(appPath) === cachedAppInfo.packageHash
        && await fs.exists(cachedAppInfo.fullPath)
        && (await fs.glob('**/*', {
          cwd: cachedAppInfo.fullPath, strict: false, nosort: true
        })).length === cachedAppInfo.integrity.folder) {
      this.log.info(`Using '${cachedAppInfo.fullPath}' which was cached from '${appPath}'`);
      return {appPath: cachedAppInfo.fullPath};
    }

    // Only local .app bundles that are available in-place should not be cached
    if (await isAppBundle(appPath)) {
      return false;
    }

    // Extract the app bundle and cache it
    try {
      return {appPath: await this.unzipApp(appPath)};
    } finally {
      // Cleanup previously downloaded archive
      if (isUrl) {
        await fs.rimraf(appPath);
      }
    }
  }

  async determineDevice () {
    // in the one case where we create a sim, we will set this state
    this.lifecycleData.createSim = false;

    // if we get generic names, translate them
    this.opts.deviceName = translateDeviceName(this.opts.platformVersion, this.opts.deviceName);

    const setupVersionCaps = async () => {
      this.opts.iosSdkVersion = await getAndCheckIosSdkVersion();
      this.log.info(`iOS SDK Version set to '${this.opts.iosSdkVersion}'`);
      if (!this.opts.platformVersion && this.opts.iosSdkVersion) {
        this.log.info(`No platformVersion specified. Using the latest version Xcode supports: '${this.opts.iosSdkVersion}'. ` +
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
          this.log.warn(`Cannot detect any connected real devices. Falling back to Simulator. Original error: ${err.message}`);
          const device = await getExistingSim(this.opts);
          if (!device) {
            // No matching Simulator is found. Throw an error
            this.log.errorAndThrow(`Cannot detect udid for ${this.opts.deviceName} Simulator running iOS ${this.opts.platformVersion}`);
          }

          // Matching Simulator exists and is found. Use it
          this.opts.udid = device.udid;
          const devicePlatform = normalizePlatformVersion(await device.getPlatformVersion());
          if (this.opts.platformVersion !== devicePlatform) {
            this.opts.platformVersion = devicePlatform;
            this.log.info(`Set platformVersion to '${devicePlatform}' to match the device with given UDID`);
          }
          await setupVersionCaps();
          return {device, realDevice: false, udid: device.udid};
        }
      } else {
        // make sure it is a connected device. If not, the udid passed in is invalid
        const devices = await getConnectedDevices();
        this.log.debug(`Available devices: ${devices.join(', ')}`);
        if (!devices.includes(this.opts.udid)) {
          // check for a particular simulator
          this.log.debug(`No real device with udid '${this.opts.udid}'. Looking for simulator`);
          try {
            const device = await getSimulator(this.opts.udid, {
              devicesSetPath: this.opts.simulatorDevicesSetPath,
            });
            return {device, realDevice: false, udid: this.opts.udid};
          } catch (ign) {
            throw new Error(`Unknown device or simulator UDID: '${this.opts.udid}'`);
          }
        }
      }

      const device = await getRealDeviceObj(this.opts.udid);
      return {device, realDevice: true, udid: this.opts.udid};
    }

    // Now we know for sure the device will be a Simulator
    await setupVersionCaps();
    if (this.opts.enforceFreshSimulatorCreation) {
      this.log.debug(`New simulator is requested. If this is not wanted, set 'enforceFreshSimulatorCreation' capability to false`);
    } else {
      // figure out the correct simulator to use, given the desired capabilities
      const device = await getExistingSim(this.opts);

      // check for an existing simulator
      if (device) {
        return {device, realDevice: false, udid: device.udid};
      }

      this.log.info('Simulator udid not provided');
    }

    // no device of this type exists, or they request new sim, so create one
    this.log.info('Using desired caps to create a new simulator');
    const device = await this.createSim();
    return {device, realDevice: false, udid: device.udid};
  }

  async startSim () {
    const runOpts = {
      scaleFactor: this.opts.scaleFactor,
      connectHardwareKeyboard: !!this.opts.connectHardwareKeyboard,
      pasteboardAutomaticSync: this.opts.simulatorPasteboardAutomaticSync ?? 'off',
      isHeadless: !!this.opts.isHeadless,
      tracePointer: this.opts.simulatorTracePointer,
      devicePreferences: {},
    };

    // add the window center, if it is specified
    if (this.opts.SimulatorWindowCenter) {
      runOpts.devicePreferences.SimulatorWindowCenter = this.opts.SimulatorWindowCenter;
    }

    if (_.isInteger(this.opts.simulatorStartupTimeout)) {
      runOpts.startupTimeout = this.opts.simulatorStartupTimeout;
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
    const platformName = this.isTvOS() ? PLATFORM_NAME_TVOS : PLATFORM_NAME_IOS;

    // create sim for caps
    const sim = await createSim(this.opts, platformName);
    this.log.info(`Created simulator with udid '${sim.udid}'.`);

    return sim;
  }

  async launchApp () {
    const APP_LAUNCH_TIMEOUT = 20 * 1000;

    this.logEvent('appLaunchAttempted');
    await this.opts.device.launchApp(this.opts.bundleId);

    let checkStatus = async () => {
      let response = await this.proxyCommand('/status', 'GET');
      let currentApp = response.currentApp.bundleID;
      if (currentApp !== this.opts.bundleId) {
        throw new Error(`${this.opts.bundleId} not in foreground. ${currentApp} is in foreground`);
      }
    };

    this.log.info(`Waiting for '${this.opts.bundleId}' to be in foreground`);
    let retries = parseInt(APP_LAUNCH_TIMEOUT / 200, 10);
    await retryInterval(retries, 200, checkStatus);
    this.log.info(`${this.opts.bundleId} is in foreground`);
    this.logEvent('appLaunched');
  }

  async startWdaSession (bundleId, processArguments) {
    const args = processArguments ? (processArguments.args || []) : [];
    if (!_.isArray(args)) {
      throw new Error(`processArguments.args capability is expected to be an array. ` +
        `${JSON.stringify(args)} is given instead`);
    }
    const env = processArguments ? (processArguments.env || {}) : {};
    if (!_.isPlainObject(env)) {
      throw new Error(`processArguments.env capability is expected to be a dictionary. ` +
        `${JSON.stringify(env)} is given instead`);
    }

    if (util.hasValue(this.opts.language)) {
      args.push('-AppleLanguages', `(${this.opts.language})`);
      args.push('-NSLanguages', `(${this.opts.language})`);
    }
    if (util.hasValue(this.opts.locale)) {
      args.push('-AppleLocale', this.opts.locale);
    }

    if (this.opts.noReset) {
      if (_.isNil(this.opts.shouldTerminateApp)) {
        this.opts.shouldTerminateApp = false;
      }
      if (_.isNil(this.opts.forceAppLaunch)) {
        this.opts.forceAppLaunch = false;
      }
    }

    const wdaCaps = {
      bundleId: this.opts.autoLaunch === false ? undefined : bundleId,
      arguments: args,
      environment: env,
      eventloopIdleDelaySec: this.opts.wdaEventloopIdleDelay ?? 0,
      shouldWaitForQuiescence: this.opts.waitForQuiescence ?? true,
      shouldUseTestManagerForVisibilityDetection: this.opts.simpleIsVisibleCheck ?? false,
      maxTypingFrequency: this.opts.maxTypingFrequency ?? 60,
      shouldUseSingletonTestManager: this.opts.shouldUseSingletonTestManager ?? true,
      waitForIdleTimeout: this.opts.waitForIdleTimeout,
      shouldUseCompactResponses: this.opts.shouldUseCompactResponses,
      elementResponseFields: this.opts.elementResponseFields,
      disableAutomaticScreenshots: this.opts.disableAutomaticScreenshots,
      shouldTerminateApp: this.opts.shouldTerminateApp ?? true,
      forceAppLaunch: this.opts.forceAppLaunch ?? true,
      useNativeCachingStrategy: this.opts.useNativeCachingStrategy ?? true,
      forceSimulatorSoftwareKeyboardPresence: this.opts.forceSimulatorSoftwareKeyboardPresence
        ?? (this.opts.connectHardwareKeyboard === true ? false : true),
    };
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

  isTvOS () {
    return _.toLower(this.opts.platformName) === _.toLower(PLATFORM_NAME_TVOS);
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
    if (_.toLower(caps.browserName) !== 'safari' && !caps.app && !caps.bundleId) {
      this.log.info('The desired capabilities include neither an app nor a bundleId. ' +
        'WebDriverAgent will be started without the default app');
    }

    if (!util.coerceVersion(caps.platformVersion, false)) {
      this.log.warn(`'platformVersion' capability ('${caps.platformVersion}') is not a valid version number. ` +
        `Consider fixing it or be ready to experience an inconsistent driver behavior.`);
    }

    let verifyProcessArgument = (processArguments) => {
      const {args, env} = processArguments;
      if (!_.isNil(args) && !_.isArray(args)) {
        this.log.errorAndThrow('processArguments.args must be an array of strings');
      }
      if (!_.isNil(env) && !_.isPlainObject(env)) {
        this.log.errorAndThrow('processArguments.env must be an object <key,value> pair {a:b, c:d}');
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
          this.log.errorAndThrow(`processArguments must be a JSON format or an object with format {args : [], env : {a:b, c:d}}. ` +
            `Both environment and argument can be null. Error: ${err}`);
        }
      } else if (_.isPlainObject(caps.processArguments)) {
        verifyProcessArgument(caps.processArguments);
      } else {
        this.log.errorAndThrow(`'processArguments must be an object, or a string JSON object with format {args : [], env : {a:b, c:d}}. ` +
          `Both environment and argument can be null.`);
      }
    }

    // there is no point in having `keychainPath` without `keychainPassword`
    if ((caps.keychainPath && !caps.keychainPassword) || (!caps.keychainPath && caps.keychainPassword)) {
      this.log.errorAndThrow(`If 'keychainPath' is set, 'keychainPassword' must also be set (and vice versa).`);
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
        this.log.errorAndThrow(`'webDriverAgentUrl' capability is expected to contain a valid WebDriverAgent server URL. ` +
                          `'${caps.webDriverAgentUrl}' is given instead`);
      }
    }

    if (caps.browserName) {
      if (caps.bundleId) {
        this.log.errorAndThrow(`'browserName' cannot be set together with 'bundleId' capability`);
      }
      // warn if the capabilities have both `app` and `browser, although this
      // is common with selenium grid
      if (caps.app) {
        this.log.warn(`The capabilities should generally not include both an 'app' and a 'browserName'`);
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
        this.log.errorAndThrow(`'${caps.permissions}' is expected to be a valid object with format ` +
          `{"<bundleId1>": {"<serviceName1>": "<serviceStatus1>", ...}, ...}. Original error: ${e.message}`);
      }
    }

    if (caps.platformVersion && !util.coerceVersion(caps.platformVersion, false)) {
      this.log.errorAndThrow(`'platformVersion' must be a valid version number. ` +
        `'${caps.platformVersion}' is given instead.`);
    }

    // additionalWebviewBundleIds is an array, JSON array, or string
    if (caps.additionalWebviewBundleIds) {
      caps.additionalWebviewBundleIds = this.helpers.parseCapsArray(caps.additionalWebviewBundleIds);
    }

    // finally, return true since the superclass check passed, as did this
    return true;
  }

  async installAUT () {
    if (this.isSafari()) {
      return;
    }

    await verifyApplicationPlatform(this.opts.app, {
      isSimulator: this.isSimulator(),
      isTvOS: this.isTvOS(),
    });

    if (this.isRealDevice()) {
      await installToRealDevice(this.opts.device, this.opts.app, this.opts.bundleId, {
        noReset: this.opts.noReset,
        timeout: this.opts.appPushTimeout,
        strategy: this.opts.appInstallStrategy,
      });
    } else {
      await installToSimulator(this.opts.device, this.opts.app, this.opts.bundleId, {
        noReset: this.opts.noReset,
        newSimulator: this.lifecycleData.createSim,
      });
    }
    if (this.opts.otherApps) {
      await this.installOtherApps(this.opts.otherApps);
    }

    if (util.hasValue(this.opts.iosInstallPause)) {
      // https://github.com/appium/appium/issues/6889
      let pause = parseInt(this.opts.iosInstallPause, 10);
      this.log.debug(`iosInstallPause set. Pausing ${pause} ms before continuing`);
      await B.delay(pause);
    }
  }

  async installOtherApps (otherApps) {
    if (this.isRealDevice()) {
      this.log.warn('Capability otherApps is only supported for Simulators');
      return;
    }
    let appsList;
    try {
      appsList = this.helpers.parseCapsArray(otherApps);
    } catch (e) {
      this.log.errorAndThrow(`Could not parse "otherApps" capability: ${e.message}`);
    }
    if (_.isEmpty(appsList)) {
      this.log.info(`Got zero apps from 'otherApps' capability value. Doing nothing`);
      return;
    }

    const appPaths = await B.all(appsList.map(
      (app) => this.helpers.configureApp(app, '.app')
    ));
    for (const otherApp of appPaths) {
      await installToSimulator(this.opts.device, otherApp, undefined, {
        noReset: this.opts.noReset,
        newSimulator: this.lifecycleData.createSim,
      });
    }
  }

  async setInitialOrientation (orientation) {
    const dstOrientation = _.toUpper(orientation);
    if (!SUPPORTED_ORIENATIONS.includes(dstOrientation)) {
      this.log.debug(
        `The initial orientation value '${orientation}' is unknown. ` +
        `Only ${JSON.stringify(SUPPORTED_ORIENATIONS)} are supported.`
      );
      return;
    }

    this.log.debug(`Setting initial orientation to '${dstOrientation}'`);
    try {
      await this.proxyCommand('/orientation', 'POST', {orientation: dstOrientation});
    } catch (err) {
      this.log.warn(`Setting initial orientation failed with: ${err.message}`);
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

    const shouldGetDeviceCaps = _.isBoolean(this.opts.includeDeviceCapsToSessionInfo)
      ? this.opts.includeDeviceCapsToSessionInfo
      : true; // Backward compatibility
    if (shouldGetDeviceCaps && !this.deviceCaps) {
      const {statusBarSize, scale} = await this.getScreenInfo();
      this.deviceCaps = {
        pixelRatio: scale,
        statBarHeight: statusBarSize.height,
        viewportRect: await this.getViewportRect(),
      };
    }
    this.log.info('Merging WDA caps over Appium caps for session detail response');
    return Object.assign({udid: this.opts.udid}, driverSession,
      this.wdaCaps.capabilities, this.deviceCaps || {});
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
