import IDB from 'appium-idb';
import {getSimulator} from 'appium-ios-simulator';
import {WebDriverAgent} from 'appium-webdriveragent';
import {BaseDriver, DeviceSettings, errors} from 'appium/driver';
import {fs, mjpeg, util, timing} from 'appium/support';
import AsyncLock from 'async-lock';
import {retryInterval} from 'asyncbox';
import B from 'bluebird';
import _ from 'lodash';
import {LRUCache} from 'lru-cache';
import EventEmitter from 'node:events';
import path from 'node:path';
import url from 'node:url';
import {
  SUPPORTED_EXTENSIONS,
  SAFARI_BUNDLE_ID,
  onPostConfigureApp,
  onDownloadApp,
  verifyApplicationPlatform,
} from './app-utils';
import commands from './commands';
import {desiredCapConstraints} from './desired-caps';
import DEVICE_CONNECTIONS_FACTORY from './device-connections-factory';
import {executeMethodMap} from './execute-method-map';
import {newMethodMap} from './method-map';
import { Pyidevice } from './real-device-clients/py-ios-device-client';
import {
  installToRealDevice,
  runRealDeviceReset,
  applySafariStartupArgs,
  detectUdid,
} from './real-device-management';
import {
  RealDevice,
  getConnectedDevices,
} from './real-device';
import {
  createSim,
  getExistingSim,
  installToSimulator,
  runSimulatorReset,
  setLocalizationPrefs,
  setSafariPrefs,
  shutdownOtherSimulators,
  shutdownSimulator,
} from './simulator-management';
import {
  DEFAULT_TIMEOUT_KEY,
  UDID_AUTO,
  checkAppPresent,
  clearSystemFiles,
  getAndCheckIosSdkVersion,
  getAndCheckXcodeVersion,
  getDriverInfo,
  isLocalHost,
  markSystemFilesForCleanup,
  normalizeCommandTimeouts,
  normalizePlatformVersion,
  printUser,
  removeAllSessionWebSocketHandlers,
  translateDeviceName,
} from './utils';
import { AppInfosCache } from './app-infos-cache';

const SHUTDOWN_OTHER_FEAT_NAME = 'shutdown_other_sims';
const CUSTOMIZE_RESULT_BUNDLE_PATH = 'customize_result_bundle_path';

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
const WDA_REAL_DEV_TUTORIAL_URL =
  'https://appium.github.io/appium-xcuitest-driver/latest/preparation/real-device-config/';
const WDA_STARTUP_RETRY_INTERVAL = 10000;
const DEFAULT_SETTINGS = {
  nativeWebTap: false,
  nativeWebTapStrict: false,
  useJSONSource: false,
  webScreenshotMode: 'native',
  shouldUseCompactResponses: true,
  elementResponseAttributes: 'type,label',
  // Read https://github.com/appium/WebDriverAgent/blob/master/WebDriverAgentLib/Utilities/FBConfiguration.m for following settings' values
  mjpegServerScreenshotQuality: 25,
  mjpegServerFramerate: 10,
  screenshotQuality: 1,
  mjpegScalingFactor: 100,
  // set `reduceMotion` to `null` so that it will be verified but still set either true/false
  reduceMotion: null,
  pageSourceExcludedAttributes: ''
};
// This lock assures, that each driver session does not
// affect shared resources of the other parallel sessions
const SHARED_RESOURCES_GUARD = new AsyncLock();
const WEB_ELEMENTS_CACHE_SIZE = 500;
const SUPPORTED_ORIENATIONS = ['LANDSCAPE', 'PORTRAIT'];
/* eslint-disable no-useless-escape */
/** @type {import('@appium/types').RouteMatcher[]} */
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
  ['DELETE', /actions$/],
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
  ['POST', /receive_async_response/], // always, in case context switches while waiting
  ['POST', /session\/[^\/]+\/location/], // geo location, but not element location
  ['POST', /shake/],
  ['POST', /timeouts/],
  ['POST', /url/],
  ['POST', /value/],
  ['POST', /window/],
  ['DELETE', /cookie/],
  ['GET', /cookie/],
  ['POST', /cookie/],
];

const NO_PROXY_WEB_LIST = /** @type {import('@appium/types').RouteMatcher[]} */ ([
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
]).concat(NO_PROXY_NATIVE_LIST);
/* eslint-enable no-useless-escape */

const MEMOIZED_FUNCTIONS = ['getStatusBarHeight', 'getDevicePixelRatio', 'getScreenInfo'];

// Capabilities that do not have xcodebuild process
const CAP_NAMES_NO_XCODEBUILD_REQUIRED = ['webDriverAgentUrl', 'usePreinstalledWDA'];

const BUNDLE_VERSION_PATTERN = /CFBundleVersion\s+=\s+"?([^(;|")]+)/;

/**
 * @implements {ExternalDriver<XCUITestDriverConstraints, FullContext|string>}
 * @extends {BaseDriver<XCUITestDriverConstraints>}
 * @privateRemarks **This class should be considered "final"**. It cannot be extended
 * due to use of public class field assignments.  If extending this class becomes a hard requirement, refer to the implementation of `BaseDriver` on how to do so.
 */
export class XCUITestDriver extends BaseDriver {
  static newMethodMap = newMethodMap;

  static executeMethodMap = executeMethodMap;

  /** @type {string|null|undefined} */
  curWindowHandle;

  /**
   * @type {boolean|undefined}
   */
  selectingNewPage;

  /** @type {string[]} */
  contexts;

  /** @type {string|null} */
  curContext;

  /** @type {string[]} */
  curWebFrames;

  /** @type {import('./types').CalibrationData|null} */
  webviewCalibrationResult;

  /**
   * @type {import('./types').Page[]|undefined}
   */
  windowHandleCache;

  /** @type {import('./types').AsyncPromise|undefined} */
  asyncPromise;

  /** @type {number|undefined} */
  asyncWaitMs;

  /** @type {((logRecord: {message: string}) => void)|null} */
  _syslogWebsocketListener;

  /** @type {import('./commands/performance').PerfRecorder[]} */
  _perfRecorders;

  /** @type {LRUCache} */
  webElementsCache;

  /**
   * @type {any|null}
   * @privateRemarks needs types
   **/
  _conditionInducerService;

  /** @type {boolean|undefined} */
  _isSafariIphone;

  /** @type {boolean|undefined} */
  _isSafariNotched;

  /** @type {import('./commands/types').WaitingAtoms} */
  _waitingAtoms;

  /** @type {import('./types').LifecycleData} */
  lifecycleData;

  /** @type {XCUITestDriverOpts} */
  opts;

  /** @type {import('./commands/record-audio').AudioRecorder|null} */
  _audioRecorder;

  /** @type {XcodeVersion|undefined} */
  xcodeVersion;

  /** @type {import('./commands/pcap').TrafficCapture|null} */
  _trafficCapture;

  /** @type {Simulator|RealDevice} */
  _device;

  /** @type {string|null} */
  _iosSdkVersion;

  /** @type {WebDriverAgent} */
  wda;

  /** @type {import('appium-remote-debugger').RemoteDebugger|null} */
  remote;

  /**
   *
   * @param {XCUITestDriverOpts} opts
   * @param {boolean} shouldValidateCaps
   */
  constructor(opts = /** @type {XCUITestDriverOpts} */ ({}), shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);

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
    this.curWebFrames = [];
    this._perfRecorders = [];
    this.desiredCapConstraints = desiredCapConstraints;
    this.webElementsCache = new LRUCache({
      max: WEB_ELEMENTS_CACHE_SIZE,
    });
    this.webviewCalibrationResult = null;
    this._waitingAtoms = {
      count: 0,
      alertNotifier: new EventEmitter(),
      alertMonitor: B.resolve(),
    };
    this.resetIos();
    this.settings = new DeviceSettings(DEFAULT_SETTINGS, this.onSettingsUpdate.bind(this));
    this.logs = {};
    this._trafficCapture = null;
    // memoize functions here, so that they are done on a per-instance basis
    for (const fn of MEMOIZED_FUNCTIONS) {
      this[fn] = _.memoize(this[fn]);
    }
    this.lifecycleData = {};
    this._audioRecorder = null;
    this.appInfosCache = new AppInfosCache(this.log);
    this.remote = null;
  }

  async onSettingsUpdate(key, value) {
    // skip sending the update request to the WDA nor saving it in opts
    // to not spend unnecessary time.
    if (['pageSourceExcludedAttributes'].includes(key)) {
      return;
    }

    if (key !== 'nativeWebTap' && key !== 'nativeWebTapStrict') {
      return await this.proxyCommand('/appium/settings', 'POST', {
        settings: {[key]: value},
      });
    }
    this.opts[key] = !!value;
  }

  resetIos() {
    this.opts = this.opts || {};
    // @ts-ignore this is ok
    this.wda = null;
    this.jwpProxyActive = false;
    this.proxyReqRes = null;
    this.safari = false;
    this.cachedWdaStatus = null;

    this.curWebFrames = [];
    this._currentUrl = null;
    this.curContext = null;
    this.xcodeVersion = undefined;
    this.contexts = [];
    this.implicitWaitMs = 0;
    this.pageLoadMs = 6000;
    this.landscapeWebCoordsOffset = 0;
    this.remote = null;
    this._conditionInducerService = null;

    this.webElementsCache = new LRUCache({
      max: WEB_ELEMENTS_CACHE_SIZE,
    });

    this._waitingAtoms = {
      count: 0,
      alertNotifier: new EventEmitter(),
      alertMonitor: B.resolve(),
    };
  }

  get driverData() {
    // TODO fill out resource info here
    return {};
  }

  async getStatus() {
    const status = {
      ready: true,
      message: 'The driver is ready to accept new connections',
      build: await getDriverInfo(),
    };
    if (this.cachedWdaStatus) {
      status.wda = this.cachedWdaStatus;
    }
    return status;
  }

  mergeCliArgsToOpts() {
    let didMerge = false;
    // this.cliArgs should never include anything we do not expect.
    for (const [key, value] of Object.entries(this.cliArgs ?? {})) {
      if (_.has(this.opts, key)) {
        this.log.info(
          `CLI arg '${key}' with value '${value}' overwrites value '${this.opts[key]}' sent in via caps)`,
        );
        didMerge = true;
      }
      this.opts[key] = value;
    }
    return didMerge;
  }

  /**
   * @returns {Simulator|RealDevice}
   */
  get device() {
    return this._device;
  }

  isXcodebuildNeeded() {
    return !(CAP_NAMES_NO_XCODEBUILD_REQUIRED.some((x) => Boolean(this.opts[x])));
  }

  async createSession(w3cCaps1, w3cCaps2, w3cCaps3, driverData) {
    try {
      let [sessionId, caps] = await super.createSession(w3cCaps1, w3cCaps2, w3cCaps3, driverData);

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

      /** @type {import('appium-webdriveragent').WDASettings} */
      let wdaSettings = {
        elementResponseAttributes: DEFAULT_SETTINGS.elementResponseAttributes,
        shouldUseCompactResponses: DEFAULT_SETTINGS.shouldUseCompactResponses,
      };
      if ('elementResponseAttributes' in this.opts && _.isString(this.opts.elementResponseAttributes)) {
        wdaSettings.elementResponseAttributes = this.opts.elementResponseAttributes;
      }
      if ('shouldUseCompactResponses' in this.opts && _.isBoolean(this.opts.shouldUseCompactResponses)) {
        wdaSettings.shouldUseCompactResponses = this.opts.shouldUseCompactResponses;
      }
      if ('mjpegServerScreenshotQuality' in this.opts && _.isNumber(this.opts.mjpegServerScreenshotQuality)) {
        wdaSettings.mjpegServerScreenshotQuality = this.opts.mjpegServerScreenshotQuality;
      }
      if ('mjpegServerFramerate' in this.opts && _.isNumber(this.opts.mjpegServerFramerate)) {
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
      return /** @type {[string, import('@appium/types').DriverCaps<XCUITestDriverConstraints>]} */ ([
        sessionId,
        caps,
      ]);
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
  getDefaultUrl() {
    // Setting this to some external URL slows down the session init
    return `${this.getWdaLocalhostRoot()}/health`;
  }

  async start() {
    this.opts.noReset = !!this.opts.noReset;
    this.opts.fullReset = !!this.opts.fullReset;

    await printUser();
    this._iosSdkVersion = null; // For WDA and xcodebuild
    const {device, udid, realDevice} = await this.determineDevice();
    this.log.info(
      `Determining device to run tests on: udid: '${udid}', real device: ${realDevice}`,
    );
    this._device = device;
    this.opts.udid = udid;

    if (this.opts.simulatorDevicesSetPath) {
      if (realDevice) {
        this.log.info(
          `The 'simulatorDevicesSetPath' capability is only supported for Simulator devices`,
        );
      } else {
        this.log.info(
          `Setting simulator devices set path to '${this.opts.simulatorDevicesSetPath}'`,
        );
        (/** @type {Simulator} */ (this.device)).devicesSetPath = this.opts.simulatorDevicesSetPath;
      }
    }

    // at this point if there is no platformVersion, get it from the device
    if (!this.opts.platformVersion) {
      this.opts.platformVersion = await this.device.getPlatformVersion();
      this.log.info(
        `No platformVersion specified. Using device version: '${this.opts.platformVersion}'`,
      );
    }

    const normalizedVersion = normalizePlatformVersion(this.opts.platformVersion);
    if (this.opts.platformVersion !== normalizedVersion) {
      this.log.info(
        `Normalized platformVersion capability value '${this.opts.platformVersion}' to '${normalizedVersion}'`,
      );
      this.opts.platformVersion = normalizedVersion;
    }
    this.caps.platformVersion = this.opts.platformVersion;

    if (_.isEmpty(this.xcodeVersion) && (this.isXcodebuildNeeded() || this.isSimulator())) {
      // no `webDriverAgentUrl`, or on a simulator, so we need an Xcode version
      this.xcodeVersion = await getAndCheckXcodeVersion();
    }
    this.logEvent('xcodeDetailsRetrieved');

    if (_.toLower(this.opts.browserName) === 'safari') {
      this.log.info('Safari test requested');
      this.safari = true;
      this.opts.app = undefined;
      this.opts.processArguments = this.opts.processArguments || {};
      applySafariStartupArgs.bind(this)();
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
        this.opts.bundleId = await this.appInfosCache.extractBundleId(this.opts.app);
      }
    }

    await this.runReset();

    this.wda = new WebDriverAgent(
      /** @type {import('appium-xcode').XcodeVersion} */ (this.xcodeVersion),
      {
        ...this.opts,
        device: this.device,
        realDevice: this.isRealDevice(),
        iosSdkVersion: this._iosSdkVersion,
      },
      // @ts-ignore this is ok
      this.log,
    );
    // Derived data path retrieval is an expensive operation
    // We could start that now in background and get the cached result
    // whenever it is needed
    // eslint-disable-next-line promise/prefer-await-to-then
    this.wda.retrieveDerivedDataPath().catch((e) => this.log.debug(e));

    const memoizedLogInfo = _.memoize(() => {
      this.log.info(
        "'skipLogCapture' is set. Skipping starting logs such as crash, system, safari console and safari network.",
      );
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
      await this.initSimulator();
      if (!isLogCaptureStarted) {
        // Retry log capture if Simulator was not running before
        await startLogCapture();
      }
    } else if (this.opts.customSSLCert) {
      await new Pyidevice(udid).installProfile({payload: this.opts.customSSLCert});
      this.logEvent('customCertInstalled');
    }

    await this.installAUT();

    // if we only have bundle identifier and no app, fail if it is not already installed
    if (
      !this.opts.app &&
      this.opts.bundleId &&
      !this.isSafari() &&
      !(await this.device.isAppInstalled(this.opts.bundleId))
    ) {
      this.log.errorAndThrow(`App with bundle identifier '${this.opts.bundleId}' unknown`);
    }

    if (this.isSimulator()) {
      if (this.opts.permissions) {
        this.log.debug('Setting the requested permissions before WDA is started');
        for (const [bundleId, permissionsMapping] of _.toPairs(JSON.parse(this.opts.permissions))) {
          await /** @type {Simulator} */ (this.device).setPermissions(bundleId, permissionsMapping);
        }
      }

      // TODO: Deprecate and remove this block together with calendarAccessAuthorized capability
      if (_.isBoolean(this.opts.calendarAccessAuthorized)) {
        this.log.warn(
          `The 'calendarAccessAuthorized' capability is deprecated and will be removed soon. ` +
            `Consider using 'permissions' one instead with 'calendar' key`,
        );
        const methodName = `${
          this.opts.calendarAccessAuthorized ? 'enable' : 'disable'
        }CalendarAccess`;
        await this.device[methodName](this.opts.bundleId);
      }
    }

    await this.startWda();

    if (_.isString(this.opts.orientation)) {
      await this.setInitialOrientation(this.opts.orientation);
      this.logEvent('orientationSet');
    }

    if (this.isSafari() || this.opts.autoWebview) {
      await this.activateRecentWebview();
    }
    if (this.isSafari()) {
      if (shouldSetInitialSafariUrl(this.opts)) {
        this.log.info(
          `About to set the initial Safari URL to '${this.getCurrentUrl()}'.` +
            `Use 'safariInitialUrl' capability in order to customize it`,
        );
        await this.setUrl(this.getCurrentUrl());
      } else {
        const currentUrl = await this.getUrl();
        this.log.info(`Current URL: ${currentUrl}`);
        this.setCurrentUrl(currentUrl);
      }
    }
  }

  /**
   * Start the simulator and initialize based on capabilities
   */
  async initSimulator() {
    const device = /** @type {Simulator} */ (this.device);

    if (this.opts.shutdownOtherSimulators) {
      this.assertFeatureEnabled(SHUTDOWN_OTHER_FEAT_NAME);
      await shutdownOtherSimulators.bind(this)();
    }

    await this.startSim();

    if (this.opts.customSSLCert) {
      // Simulator must be booted in order to call this helper
      await device.addCertificate(this.opts.customSSLCert);
      this.logEvent('customCertInstalled');
    }

    if (await setSafariPrefs.bind(this)()) {
      this.log.debug('Safari preferences have been updated');
    }

    if (await setLocalizationPrefs.bind(this)()) {
      this.log.debug('Localization preferences have been updated');
    }

    /** @type {Promise[]} */
    const promises = ['reduceMotion', 'reduceTransparency', 'autoFillPasswords']
      .filter((optName) => _.isBoolean(this.opts[optName]))
      .map((optName) => {
        this.log.info(`Setting ${optName} to ${this.opts[optName]}`);
        return device[`set${_.upperFirst(optName)}`](this.opts[optName]);
      });
    await B.all(promises);

    if (this.opts.launchWithIDB) {
      try {
        const idb = new IDB({udid: this.opts.udid});
        await idb.connect();
        device.idb = idb;
      } catch (e) {
        this.log.debug(e.stack);
        this.log.warn(
          `idb will not be used for Simulator interaction. Original error: ${e.message}`,
        );
      }
    }

    this.logEvent('simStarted');
  }

  /**
   * Start WebDriverAgentRunner
   */
  async startWda() {
    // Don't cleanup the processes if webDriverAgentUrl is set
    if (!util.hasValue(this.wda.webDriverAgentUrl)) {
      await this.wda.cleanupObsoleteProcesses();
    }

    const usePortForwarding =
      this.isRealDevice() && !this.wda.webDriverAgentUrl && isLocalHost(this.wda.wdaBaseUrl);
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
    this.log.debug(
      `Starting WebDriverAgent initialization with the synchronization key '${synchronizationKey}'`,
    );
    if (SHARED_RESOURCES_GUARD.isBusy() && !this.opts.derivedDataPath && !this.opts.bootstrapPath) {
      this.log.debug(
        `Consider setting a unique 'derivedDataPath' capability value for each parallel driver instance ` +
          `to avoid conflicts and speed up the building process`,
      );
    }

    if (this.opts.usePreinstalledWDA && this.opts.prebuiltWDAPath && !(await fs.exists(this.opts.prebuiltWDAPath))) {
      throw new Error(
        `The prebuilt WebDriverAgent app at '${this.opts.prebuiltWDAPath}' provided as 'prebuiltWDAPath' ` +
        `capability value does not exist or is not accessible`
      );
    }

    return await SHARED_RESOURCES_GUARD.acquire(synchronizationKey, async () => {
      if (this.opts.useNewWDA) {
        this.log.debug(`Capability 'useNewWDA' set to true, so uninstalling WDA before proceeding`);
        await this.wda.quitAndUninstall();
        this.logEvent('wdaUninstalled');
      } else if (!util.hasValue(this.wda.webDriverAgentUrl) && this.isXcodebuildNeeded()) {
        await this.wda.setupCaching();
      }

      // local helper for the two places we need to uninstall wda and re-start it
      const quitAndUninstall = async (msg) => {
        this.log.debug(msg);
        if (!this.isXcodebuildNeeded()) {
          this.log.debug(
            `Not quitting/uninstalling WebDriverAgent since at least one of ${CAP_NAMES_NO_XCODEBUILD_REQUIRED} capabilities is provided`,
          );
          throw new Error(msg);
        }
        this.log.warn('Quitting and uninstalling WebDriverAgent');
        await this.wda.quitAndUninstall();

        throw new Error(msg);
      };

      // Used in the following WDA build
      if (this.opts.resultBundlePath) {
        this.assertFeatureEnabled(CUSTOMIZE_RESULT_BUNDLE_PATH);
      }

      let startupRetries =
        this.opts.wdaStartupRetries ||
        (this.isRealDevice() ? WDA_REAL_DEV_STARTUP_RETRIES : WDA_SIM_STARTUP_RETRIES);
      const startupRetryInterval = this.opts.wdaStartupRetryInterval || WDA_STARTUP_RETRY_INTERVAL;

      // These values help only xcodebuild.
      if (this.isXcodebuildNeeded()) {
        this.log.debug(
          `Trying to start WebDriverAgent ${startupRetries} times with ${startupRetryInterval}ms interval`,
        );
        if (
          !util.hasValue(this.opts.wdaStartupRetries) &&
          !util.hasValue(this.opts.wdaStartupRetryInterval)
        ) {
          this.log.debug(
            `These values can be customized by changing wdaStartupRetries/wdaStartupRetryInterval capabilities`,
          );
        }
      } else {
        // The startup retry will be one time if the session does not need WDA build
        this.log.debug(`Trying to start WebDriverAgent once since at least one of ${CAP_NAMES_NO_XCODEBUILD_REQUIRED} capabilities is provided`);
        startupRetries = 1;
      }

      /** @type {Error|null} */
      let shortCircuitError = null;
      let retryCount = 0;
      await retryInterval(startupRetries, startupRetryInterval, async () => {
        this.logEvent('wdaStartAttempted');
        if (retryCount > 0) {
          this.log.info(`Retrying WDA startup (${retryCount + 1} of ${startupRetries})`);
        }
        try {
          if (this.opts.usePreinstalledWDA) {
            await this.preparePreinstalledWda();
          }

          this.cachedWdaStatus = await this.wda.launch(/** @type {string} */ (this.sessionId));
        } catch (err) {
          this.logEvent('wdaStartFailed');
          this.log.debug(err.stack);
          retryCount++;
          let errorMsg = `Unable to launch WebDriverAgent. Original error: ${err.message}`;
          if (this.isRealDevice()) {
            errorMsg += `. Make sure you follow the tutorial at ${WDA_REAL_DEV_TUTORIAL_URL}`;
          }
          if (this.opts.usePreinstalledWDA) {
            try {
              // In case the bundle id process start got failed because of
              // auth popup in the device. Then, the bundle id process itself started. It is safe to stop it here.
              await this.mobileKillApp(this.wda.bundleIdForXctest);
            } catch (ign) {};
            // Mostly it failed to start the WDA process as no the bundle id
            // e.g. '<bundle id of WDA> not found on device <udid>'

            errorMsg = `Unable to launch WebDriverAgent. Original error: ${err.message}. ` +
              `Make sure the application ${this.wda.bundleIdForXctest} exists and it is launchable.`;
            if (this.isRealDevice()) {
              errorMsg += ` ${WDA_REAL_DEV_TUTORIAL_URL} may help to complete the preparation.`;
            };
            throw new Error(errorMsg);
          } else {
            await quitAndUninstall(errorMsg);
          }
        }

        this.proxyReqRes = this.wda.proxyReqRes.bind(this.wda);
        this.jwpProxyActive = true;

        try {
          this.logEvent('wdaSessionAttempted');
          this.log.debug('Sending createSession command to WDA');
          this.cachedWdaStatus = this.cachedWdaStatus || (await this.proxyCommand('/status', 'GET'));
          await this.startWdaSession(this.opts.bundleId, this.opts.processArguments);
          this.logEvent('wdaSessionStarted');
        } catch (err) {
          this.logEvent('wdaSessionFailed');
          this.log.debug(err.stack);
          if (err instanceof errors.TimeoutError) {
            // Session startup timed out. There is no point to retry
            shortCircuitError = err;
            return;
          }
          let errorMsg = `Unable to start WebDriverAgent session. Original error: ${err.message}`;
          if (this.isRealDevice() && _.includes(err.message, 'xcodebuild')) {
            errorMsg += ` Make sure you follow the tutorial at ${WDA_REAL_DEV_TUTORIAL_URL}.`;
          }
          throw new Error(errorMsg);
        }

        if (this.opts.clearSystemFiles && this.isXcodebuildNeeded()) {
          await markSystemFilesForCleanup(this.wda);
        }

        // we expect certain socket errors until this point, but now
        // mark things as fully working
        this.wda.fullyStarted = true;
        this.logEvent('wdaStarted');
      });

      if (shortCircuitError) {
        throw shortCircuitError;
      }
    });
  }

  /**
   *
   * @param {boolean} [enforceSimulatorShutdown=false]
   */
  async runReset(enforceSimulatorShutdown = false) {
    this.logEvent('resetStarted');
    if (this.isRealDevice()) {
      await runRealDeviceReset.bind(this)();
    } else {
      await runSimulatorReset.bind(this)(enforceSimulatorShutdown);
    }
    this.logEvent('resetComplete');
  }

  async deleteSession() {
    await removeAllSessionWebSocketHandlers(this.server, this.sessionId);

    for (const recorder of _.compact([
      this._recentScreenRecorder,
      this._audioRecorder,
      this._trafficCapture,
    ])) {
      await recorder.interrupt(true);
      await recorder.cleanup();
    }

    if (!_.isEmpty(this._perfRecorders)) {
      await B.all(this._perfRecorders.map((x) => x.stop(true)));
      this._perfRecorders = [];
    }

    if (this._conditionInducerService) {
      this.disableConditionInducer();
    }

    await this.stop();

    if (this.wda && this.isXcodebuildNeeded()) {
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
      await this.runReset(true);
    }

    const simulatorDevice = this.isSimulator() ? /** @type {Simulator} */ (this.device) : null;
    if (simulatorDevice && this.lifecycleData.createSim) {
      this.log.debug(`Deleting simulator created for this run (udid: '${simulatorDevice.udid}')`);
      await shutdownSimulator.bind(this)();
      await simulatorDevice.delete();
    }

    const shouldResetLocationServivce = this.isRealDevice() && !!this.opts.resetLocationService;
    if (shouldResetLocationServivce) {
      try {
        await this.mobileResetLocationService();
      } catch (ignore) {
        /* Ignore this error since mobileResetLocationService already logged the error */
      }
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

  async stop() {
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
      // The former could cache the xcodebuild, so should not quit the process.
      // If the session skiped the xcodebuild (this.wda.canSkipXcodebuild), the this.wda instance
      // should quit properly.
      if ((!this.wda.webDriverAgentUrl && this.opts.useNewWDA) || this.wda.canSkipXcodebuild) {
        await this.wda.quit();
      }
    }

    DEVICE_CONNECTIONS_FACTORY.releaseConnection(this.opts.udid);
  }

  /**
   *
   * @param {string} cmd
   * @param {...any} args
   * @returns {Promise<any>}
   */
  async executeCommand(cmd, ...args) {
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

  async configureApp() {
    function appIsPackageOrBundle(app) {
      return /^([a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+)+$/.test(app);
    }

    // the app name is a bundleId assign it to the bundleId property
    if (!this.opts.bundleId && appIsPackageOrBundle(this.opts.app)) {
      this.opts.bundleId = this.opts.app;
      this.opts.app = '';
    }
    // we have a bundle ID, but no app, or app is also a bundle
    if (
      this.opts.bundleId &&
      appIsPackageOrBundle(this.opts.bundleId) &&
      (this.opts.app === '' || appIsPackageOrBundle(this.opts.app))
    ) {
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
      onPostProcess: onPostConfigureApp.bind(this),
      onDownload: onDownloadApp.bind(this),
      supportedExtensions: SUPPORTED_EXTENSIONS,
    });
  }

  async determineDevice() {
    // in the one case where we create a sim, we will set this state
    this.lifecycleData.createSim = false;

    // if we get generic names, translate them
    this.opts.deviceName = translateDeviceName(this.opts.platformVersion ?? '', this.opts.deviceName);

    const setupVersionCaps = async () => {
      this._iosSdkVersion = await getAndCheckIosSdkVersion();
      this.log.info(`iOS SDK Version set to '${this._iosSdkVersion}'`);
      if (!this.opts.platformVersion && this._iosSdkVersion) {
        this.log.info(
          `No platformVersion specified. Using the latest version Xcode supports: '${this._iosSdkVersion}'. ` +
            `This may cause problems if a simulator does not exist for this platform version.`,
        );
        this.opts.platformVersion = normalizePlatformVersion(this._iosSdkVersion);
      }
    };

    if (this.opts.udid) {
      if (this.opts.udid.toLowerCase() === UDID_AUTO) {
        try {
          this.opts.udid = await detectUdid.bind(this)();
        } catch (err) {
          // Trying to find matching UDID for Simulator
          this.log.warn(
            `Cannot detect any connected real devices. Falling back to Simulator. Original error: ${err.message}`,
          );
          await setupVersionCaps();

          const device = await getExistingSim.bind(this)();
          if (!device) {
            // No matching Simulator is found. Throw an error
            throw this.log.errorWithException(
              `Cannot detect udid for ${this.opts.deviceName} Simulator running iOS ${this.opts.platformVersion}`,
            );
          }
          this.opts.udid = device.udid;
          return {device, realDevice: false, udid: device.udid};
        }
      } else {
        // If the session specified this.opts.webDriverAgentUrl with a real device,
        // we can assume the user prepared the device properly already.
        let isRealDeviceUdid = false;
        const shouldCheckAvailableRealDevices = !this.opts.webDriverAgentUrl;
        if (shouldCheckAvailableRealDevices) {
          const devices = await getConnectedDevices();
          this.log.debug(`Available real devices: ${devices.join(', ')}`);
          isRealDeviceUdid = devices.includes(this.opts.udid);
        }
        if (!isRealDeviceUdid) {
          try {
            const device = await getSimulator(this.opts.udid, {
              devicesSetPath: this.opts.simulatorDevicesSetPath,
              // @ts-ignore This is ok
              logger: this.log,
            });
            return {device, realDevice: false, udid: this.opts.udid};
          } catch {
            if (shouldCheckAvailableRealDevices) {
              throw new Error(`Unknown device or simulator UDID: '${this.opts.udid}'`);
            }
            this.log.debug(
              'Skipping checking of the real devices availability since the session specifies appium:webDriverAgentUrl'
            );
          }
        }
      }

      this.log.debug(`Creating iDevice object with udid '${this.opts.udid}'`);
      const device = new RealDevice(this.opts.udid, this.log);
      return {device, realDevice: true, udid: this.opts.udid};
    }

    this.log.info(
      `No real device udid has been provided in capabilities. ` +
        `Will select a matching simulator to run the test.`,
    );
    await setupVersionCaps();
    if (this.opts.enforceFreshSimulatorCreation) {
      this.log.debug(
        `New simulator is requested. If this is not wanted, set 'enforceFreshSimulatorCreation' capability to false`,
      );
    } else {
      // figure out the correct simulator to use, given the desired capabilities
      const device = await getExistingSim.bind(this)();
      // check for an existing simulator
      if (device) {
        return {device, realDevice: false, udid: device.udid};
      }
    }

    // no device of this type exists, or they request new sim, so create one
    this.log.info('Using desired caps to create a new simulator');
    const device = await this.createSim();
    return {device, realDevice: false, udid: device.udid};
  }

  async startSim() {
    /** @type {import('appium-ios-simulator').DevicePreferences} */
    const devicePreferences = {};
    /** @type {import('appium-ios-simulator').RunOptions} */
    const runOpts = {
      scaleFactor: this.opts.scaleFactor,
      connectHardwareKeyboard: !!this.opts.connectHardwareKeyboard,
      pasteboardAutomaticSync: this.opts.simulatorPasteboardAutomaticSync ?? 'off',
      isHeadless: !!this.opts.isHeadless,
      tracePointer: this.opts.simulatorTracePointer,
      devicePreferences,
    };

    // add the window center, if it is specified
    if (this.opts.simulatorWindowCenter) {
      devicePreferences.SimulatorWindowCenter = this.opts.simulatorWindowCenter;
    }

    if (_.isInteger(this.opts.simulatorStartupTimeout)) {
      runOpts.startupTimeout = this.opts.simulatorStartupTimeout;
    }

    // This is to workaround XCTest bug about changing Simulator
    // orientation is not synchronized to the actual window orientation
    const orientation = _.isString(this.opts.orientation) && this.opts.orientation.toUpperCase();
    switch (orientation) {
      case 'LANDSCAPE':
        devicePreferences.SimulatorWindowOrientation = 'LandscapeLeft';
        devicePreferences.SimulatorWindowRotationAngle = 90;
        break;
      case 'PORTRAIT':
        devicePreferences.SimulatorWindowOrientation = 'Portrait';
        devicePreferences.SimulatorWindowRotationAngle = 0;
        break;
    }

    await /** @type {Simulator} */ (this.device).run(runOpts);
  }

  async createSim() {
    this.lifecycleData.createSim = true;
    // create sim for caps
    const sim = await createSim.bind(this)();
    this.log.info(`Created simulator with udid '${sim.udid}'.`);
    return sim;
  }

  async startWdaSession(bundleId, processArguments) {
    const args = processArguments ? _.cloneDeep(processArguments.args) || [] : [];
    if (!_.isArray(args)) {
      throw new Error(
        `processArguments.args capability is expected to be an array. ` +
          `${JSON.stringify(args)} is given instead`,
      );
    }
    const env = processArguments ? _.cloneDeep(processArguments.env) || {} : {};
    if (!_.isPlainObject(env)) {
      throw new Error(
        `processArguments.env capability is expected to be a dictionary. ` +
          `${JSON.stringify(env)} is given instead`,
      );
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

    if (util.hasValue(this.opts.appTimeZone)) {
      // https://developer.apple.com/forums/thread/86951?answerId=263395022#263395022
      env.TZ = this.opts.appTimeZone;
    }

    /** @type {import('appium-webdriveragent').WDACapabilities} */
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
      // @ts-expect-error - do not assign arbitrary properties to `this.opts`
      shouldUseCompactResponses: this.opts.shouldUseCompactResponses,
      // @ts-expect-error - do not assign arbitrary properties to `this.opts`
      elementResponseFields: this.opts.elementResponseFields,
      disableAutomaticScreenshots: this.opts.disableAutomaticScreenshots,
      shouldTerminateApp: this.opts.shouldTerminateApp ?? true,
      forceAppLaunch: this.opts.forceAppLaunch ?? true,
      appLaunchStateTimeoutSec: this.opts.appLaunchStateTimeoutSec,
      useNativeCachingStrategy: this.opts.useNativeCachingStrategy ?? true,
      forceSimulatorSoftwareKeyboardPresence:
        this.opts.forceSimulatorSoftwareKeyboardPresence ??
        (this.opts.connectHardwareKeyboard === true ? false : true),
    };
    if (this.opts.autoAcceptAlerts) {
      wdaCaps.defaultAlertAction = 'accept';
    } else if (this.opts.autoDismissAlerts) {
      wdaCaps.defaultAlertAction = 'dismiss';
    }
    if (this.opts.initialDeeplinkUrl) {
      this.log.info(`The deeplink URL will be set to ${this.opts.initialDeeplinkUrl}`);
      wdaCaps.initialUrl = this.opts.initialDeeplinkUrl;
    }

    const timer = new timing.Timer().start();
    await this.proxyCommand('/session', 'POST', {
      capabilities: {
        firstMatch: [wdaCaps],
        alwaysMatch: {},
      },
    });
    this.log.info(`WDA session startup took ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
  }

  // Override Proxy methods from BaseDriver
  proxyActive() {
    return Boolean(this.jwpProxyActive);
  }

  getProxyAvoidList() {
    if (this.isWebview()) {
      return NO_PROXY_WEB_LIST;
    }
    return NO_PROXY_NATIVE_LIST;
  }

  canProxy() {
    return true;
  }

  /**
   * @returns {boolean}
   */
  isSafari() {
    return !!this.safari;
  }

  /**
   * @returns {boolean}
   */
  isRealDevice() {
    return 'devicectl' in (this.device ?? {});
  }

  /**
   * @returns {boolean}
   */
  isSimulator() {
    return 'simctl' in (this.device ?? {});
  }

  /**
   * @param {string} strategy
   */
  validateLocatorStrategy(strategy) {
    super.validateLocatorStrategy(strategy, this.isWebContext());
  }

  /**
   * @param {any} caps
   * @returns {caps is import('@appium/types').DriverCaps<XCUITestDriverConstraints>}
   */
  validateDesiredCaps(caps) {
    if (!super.validateDesiredCaps(caps)) {
      return false;
    }

    // make sure that the capabilities have one of `app` or `bundleId`
    if (_.toLower(caps.browserName) !== 'safari' && !caps.app && !caps.bundleId) {
      this.log.info(
        'The desired capabilities include neither an app nor a bundleId. ' +
          'WebDriverAgent will be started without the default app',
      );
    }

    if (!util.coerceVersion(String(caps.platformVersion), false)) {
      this.log.warn(
        `'platformVersion' capability ('${caps.platformVersion}') is not a valid version number. ` +
          `Consider fixing it or be ready to experience an inconsistent driver behavior.`,
      );
    }

    let verifyProcessArgument = (processArguments) => {
      const {args, env} = processArguments;
      if (!_.isNil(args) && !_.isArray(args)) {
        this.log.errorAndThrow('processArguments.args must be an array of strings');
      }
      if (!_.isNil(env) && !_.isPlainObject(env)) {
        this.log.errorAndThrow(
          'processArguments.env must be an object <key,value> pair {a:b, c:d}',
        );
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
          this.log.errorAndThrow(
            `processArguments must be a JSON format or an object with format {args : [], env : {a:b, c:d}}. ` +
              `Both environment and argument can be null. Error: ${err}`,
          );
        }
      } else if (_.isPlainObject(caps.processArguments)) {
        verifyProcessArgument(caps.processArguments);
      } else {
        this.log.errorAndThrow(
          `'processArguments must be an object, or a string JSON object with format {args : [], env : {a:b, c:d}}. ` +
            `Both environment and argument can be null.`,
        );
      }
    }

    // there is no point in having `keychainPath` without `keychainPassword`
    if (
      (caps.keychainPath && !caps.keychainPassword) ||
      (!caps.keychainPath && caps.keychainPassword)
    ) {
      this.log.errorAndThrow(
        `If 'keychainPath' is set, 'keychainPassword' must also be set (and vice versa).`,
      );
    }

    // `resetOnSessionStartOnly` should be set to true by default
    this.opts.resetOnSessionStartOnly =
      !util.hasValue(this.opts.resetOnSessionStartOnly) || this.opts.resetOnSessionStartOnly;
    this.opts.useNewWDA = util.hasValue(this.opts.useNewWDA) ? this.opts.useNewWDA : false;

    if (caps.commandTimeouts) {
      caps.commandTimeouts = normalizeCommandTimeouts(caps.commandTimeouts);
    }

    if (_.isString(caps.webDriverAgentUrl)) {
      const {protocol, host} = url.parse(caps.webDriverAgentUrl);
      if (_.isEmpty(protocol) || _.isEmpty(host)) {
        this.log.errorAndThrow(
          `'webDriverAgentUrl' capability is expected to contain a valid WebDriverAgent server URL. ` +
            `'${caps.webDriverAgentUrl}' is given instead`,
        );
      }
    }

    if (caps.browserName) {
      if (caps.bundleId) {
        this.log.errorAndThrow(`'browserName' cannot be set together with 'bundleId' capability`);
      }
      // warn if the capabilities have both `app` and `browser, although this
      // is common with selenium grid
      if (caps.app) {
        this.log.warn(
          `The capabilities should generally not include both an 'app' and a 'browserName'`,
        );
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
        this.log.errorAndThrow(
          `'${caps.permissions}' is expected to be a valid object with format ` +
            `{"<bundleId1>": {"<serviceName1>": "<serviceStatus1>", ...}, ...}. Original error: ${e.message}`,
        );
      }
    }

    if (caps.platformVersion && !util.coerceVersion(caps.platformVersion, false)) {
      this.log.errorAndThrow(
        `'platformVersion' must be a valid version number. ` +
          `'${caps.platformVersion}' is given instead.`,
      );
    }

    // additionalWebviewBundleIds is an array, JSON array, or string
    if (caps.additionalWebviewBundleIds) {
      caps.additionalWebviewBundleIds = this.helpers.parseCapsArray(
        caps.additionalWebviewBundleIds,
      );
    }

    // finally, return true since the superclass check passed, as did this
    return true;
  }

  /**
   * Check if the given app can be installed, or should uninstall before installing it.
   *
   * @param {AutInstallationStateOptions} [opts]
   * @returns {Promise<AutInstallationState>}
   */
  async checkAutInstallationState(opts) {
    const {enforceAppInstall, fullReset, noReset, bundleId, app} = opts ?? this.opts;

    const wasAppInstalled = await this.device.isAppInstalled(bundleId);
    if (wasAppInstalled) {
      this.log.info(`App '${bundleId}' is already installed`);
      if (noReset) {
        this.log.info('noReset is requested. The app will not be be (re)installed');
        return {
          install: false,
          skipUninstall: true,
        };
      }
    } else {
      this.log.info(`App '${bundleId}' is not installed yet or it has an offload and ` +
        'cannot be detected, which might keep the local data.');
    }
    if (enforceAppInstall !== false || fullReset || !wasAppInstalled) {
      return {
        install: true,
        skipUninstall: !wasAppInstalled,
      };
    }

    const candidateBundleVersion = await this.appInfosCache.extractBundleVersion(app);
    this.log.debug(`CFBundleVersion from Info.plist: ${candidateBundleVersion}`);
    if (!candidateBundleVersion) {
      return {
        install: true,
        skipUninstall: false,
      };
    }

    const appBundleVersion = this.isRealDevice()
      ? (await /** @type {RealDevice} */ (this.device).fetchAppInfo(bundleId))?.CFBundleVersion
      : BUNDLE_VERSION_PATTERN.exec(await /** @type {Simulator} */ (this.device).simctl.appInfo(bundleId))?.[1];
    this.log.debug(`CFBundleVersion from installed app info: ${appBundleVersion}`);
    if (!appBundleVersion) {
      return {
        install: true,
        skipUninstall: false,
      };
    }

    let shouldUpgrade;
    try {
      shouldUpgrade = util.compareVersions(candidateBundleVersion, '>', appBundleVersion);
    } catch (err) {
      this.log.warn(`App versions comparison is not possible: ${err.message}`);
      return {
        install: true,
        skipUninstall: false,
      };
    }
    if (shouldUpgrade) {
      this.log.info(
        `The installed version of ${bundleId} is lower than the candidate one ` +
          `(${candidateBundleVersion} > ${appBundleVersion}). The app will be upgraded.`,
      );
    } else {
      this.log.info(
        `The candidate version of ${bundleId} is lower than the installed one ` +
          `(${candidateBundleVersion} <= ${appBundleVersion}). The app won't be reinstalled.`,
      );
    }
    return {
      install: shouldUpgrade,
      skipUninstall: true,
    };
  }

  async installAUT() {
    // install any other apps
    if (this.opts.otherApps) {
      await this.installOtherApps(this.opts.otherApps);
    }

    if (this.isSafari() || !this.opts.app) {
      return;
    }

    await verifyApplicationPlatform.bind(this)();

    const {install, skipUninstall} = await this.checkAutInstallationState();
    if (install) {
      if (this.isRealDevice()) {
        await installToRealDevice.bind(this)(this.opts.app, this.opts.bundleId, {
          skipUninstall,
          timeout: this.opts.appPushTimeout,
        });
      } else {
        await installToSimulator.bind(this)(this.opts.app, this.opts.bundleId, {
          skipUninstall,
          newSimulator: this.lifecycleData?.createSim,
        });
      }
      if (util.hasValue(this.opts.iosInstallPause)) {
        // https://github.com/appium/appium/issues/6889
        const pauseMs = parseInt(this.opts.iosInstallPause, 10);
        this.log.debug(`iosInstallPause set. Pausing ${pauseMs} ms before continuing`);
        await B.delay(pauseMs);
      }
      this.logEvent('appInstalled');
    }
  }

  /**
   * @param {string|string[]} otherApps
   * @returns {Promise<void>}
   */
  async installOtherApps(otherApps) {
    /** @type {string[]|undefined} */
    let appsList;
    try {
      appsList = this.helpers.parseCapsArray(otherApps);
    } catch (e) {
      this.log.errorAndThrow(`Could not parse "otherApps" capability: ${e.message}`);
    }
    if (!appsList || !appsList.length) {
      this.log.info(`Got zero apps from 'otherApps' capability value. Doing nothing`);
      return;
    }

    /** @type {string[]} */
    const appPaths = await B.all(appsList.map((app) => this.helpers.configureApp(app, {
      onPostProcess: onPostConfigureApp.bind(this),
      onDownload: onDownloadApp.bind(this),
      supportedExtensions: SUPPORTED_EXTENSIONS,
    })));
    /** @type {string[]} */
    const appIds = await B.all(appPaths.map((appPath) => this.appInfosCache.extractBundleId(appPath)));
    for (const [appId, appPath] of _.zip(appIds, appPaths)) {
      if (this.isRealDevice()) {
        await installToRealDevice.bind(this)(
          appPath,
          appId,
          {
            skipUninstall: true, // to make the behavior as same as UIA2
            timeout: this.opts.appPushTimeout,
          },
        );
      } else {
        await installToSimulator.bind(this)(
          appPath,
          appId,
          {
            newSimulator: this.lifecycleData.createSim,
          },
        );
      }
    }
  }

  /**
   * @param {string} orientation
   * @returns {Promise<void>}
   */
  async setInitialOrientation(orientation) {
    const dstOrientation = _.toUpper(orientation);
    if (!SUPPORTED_ORIENATIONS.includes(dstOrientation)) {
      this.log.debug(
        `The initial orientation value '${orientation}' is unknown. ` +
          `Only ${JSON.stringify(SUPPORTED_ORIENATIONS)} are supported.`,
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

  /**
   * @param {string} [cmdName]
   * @returns {number|undefined}
   */
  _getCommandTimeout(cmdName) {
    if (this.opts.commandTimeouts) {
      if (cmdName && _.has(this.opts.commandTimeouts, cmdName)) {
        return this.opts.commandTimeouts[cmdName];
      }
      return this.opts.commandTimeouts[DEFAULT_TIMEOUT_KEY];
    }
  }

  /**
   * Reset the current session (run the delete session and create session subroutines)
   */
  // eslint-disable-next-line require-await
  async reset() {
    throw new Error(
      `The reset API has been deprecated and is not supported anymore. ` +
        `Consider using corresponding 'mobile:' extensions to manage the state of the app under test.`,
    );
  }

  async preparePreinstalledWda() {
    if (this.isRealDevice()) {
      // Stop the existing process before starting a new one to start a fresh WDA process every session.
      await this.mobileKillApp(this.wda.bundleIdForXctest);
    }

    if (!this.opts.prebuiltWDAPath) {
      return;
    }

    const candidateBundleId = await this.appInfosCache.extractBundleId(this.opts.prebuiltWDAPath);
    this.wda.updatedWDABundleId = candidateBundleId.replace('.xctrunner', '');
    this.log.info(
      `Installing prebuilt WDA at '${this.opts.prebuiltWDAPath}'. ` +
      `Bundle identifier: ${candidateBundleId}.`
    );

    // Note: The CFBundleVersion in the test bundle was always 1.
    // It may not be able to compare with the installed versio.
    if (this.isRealDevice()) {
      await installToRealDevice.bind(this)(
        this.opts.prebuiltWDAPath,
        candidateBundleId,
        {
          skipUninstall: true,
          timeout: this.opts.appPushTimeout,
        },
      );
    } else {
      await installToSimulator.bind(this)(
        this.opts.prebuiltWDAPath,
        candidateBundleId
      );
    }
  }

  /*---------------+
   | ACTIVEAPPINFO |
   +---------------+*/

  mobileGetActiveAppInfo = commands.activeAppInfoExtensions.mobileGetActiveAppInfo;

  /*-------+
   | ALERT |
   +-------+*/
  getAlertText = commands.alertExtensions.getAlertText;
  setAlertText = commands.alertExtensions.setAlertText;
  postAcceptAlert = commands.alertExtensions.postAcceptAlert;
  postDismissAlert = commands.alertExtensions.postDismissAlert;
  getAlertButtons = commands.alertExtensions.getAlertButtons;
  mobileHandleAlert = commands.alertExtensions.mobileHandleAlert;

  /*---------------+
   | APPMANAGEMENT |
   +---------------+*/

  mobileInstallApp = commands.appManagementExtensions.mobileInstallApp;
  mobileIsAppInstalled = commands.appManagementExtensions.mobileIsAppInstalled;
  mobileRemoveApp = commands.appManagementExtensions.mobileRemoveApp;
  mobileLaunchApp = commands.appManagementExtensions.mobileLaunchApp;
  mobileTerminateApp = commands.appManagementExtensions.mobileTerminateApp;
  mobileActivateApp = commands.appManagementExtensions.mobileActivateApp;
  mobileKillApp = commands.appManagementExtensions.mobileKillApp;
  mobileQueryAppState = commands.appManagementExtensions.mobileQueryAppState;
  installApp = commands.appManagementExtensions.installApp;
  activateApp = commands.appManagementExtensions.activateApp;
  isAppInstalled = commands.appManagementExtensions.isAppInstalled;
  // @ts-ignore it must return boolean
  terminateApp = commands.appManagementExtensions.terminateApp;
  queryAppState = commands.appManagementExtensions.queryAppState;
  mobileListApps = commands.appManagementExtensions.mobileListApps;
  mobileClearApp = commands.appManagementExtensions.mobileClearApp;

  /*------------+
   | APPEARANCE |
   +------------+*/

  mobileSetAppearance = commands.appearanceExtensions.mobileSetAppearance;
  mobileGetAppearance = commands.appearanceExtensions.mobileGetAppearance;

  /*------------+
   | AUDIT      |
   +------------+*/

  mobilePerformAccessibilityAudit = commands.auditExtensions.mobilePerformAccessibilityAudit;

  /*---------+
   | BATTERY |
   +---------+*/
  mobileGetBatteryInfo = commands.batteryExtensions.mobileGetBatteryInfo;

  /*-----------+
   | BIOMETRIC |
   +-----------+*/

  mobileEnrollBiometric = commands.biometricExtensions.mobileEnrollBiometric;
  mobileSendBiometricMatch = commands.biometricExtensions.mobileSendBiometricMatch;
  mobileIsBiometricEnrolled = commands.biometricExtensions.mobileIsBiometricEnrolled;

  /*-------------+
   | CERTIFICATE |
   +-------------+*/
  mobileInstallCertificate = commands.certificateExtensions.mobileInstallCertificate;
  mobileListCertificates = commands.certificateExtensions.mobileListCertificates;
  mobileRemoveCertificate = commands.certificateExtensions.mobileRemoveCertificate;

  /*-----------+
   | CLIPBOARD |
   +-----------+*/

  setClipboard = commands.clipboardExtensions.setClipboard;
  getClipboard = commands.clipboardExtensions.getClipboard;

  /*-----------+
   | CONDITION |
   +-----------+*/

  listConditionInducers = commands.conditionExtensions.listConditionInducers;
  enableConditionInducer = commands.conditionExtensions.enableConditionInducer;
  disableConditionInducer = commands.conditionExtensions.disableConditionInducer;

  /*---------+
   | CONTEXT |
   +---------+*/

  getContexts = commands.contextExtensions.getContexts;
  getCurrentContext = commands.contextExtensions.getCurrentContext;
  getWindowHandle = commands.contextExtensions.getWindowHandle;
  getWindowHandles = commands.contextExtensions.getWindowHandles;
  setContext = commands.contextExtensions.setContext;
  setWindow = commands.contextExtensions.setWindow;
  activateRecentWebview = commands.contextExtensions.activateRecentWebview;
  connectToRemoteDebugger = commands.contextExtensions.connectToRemoteDebugger;
  getContextsAndViews = commands.contextExtensions.getContextsAndViews;
  listWebFrames = commands.contextExtensions.listWebFrames;
  mobileGetContexts = commands.contextExtensions.mobileGetContexts;
  onPageChange = commands.contextExtensions.onPageChange;
  useNewSafari = commands.contextExtensions.useNewSafari;
  getCurrentUrl = commands.contextExtensions.getCurrentUrl;
  getNewRemoteDebugger = commands.contextExtensions.getNewRemoteDebugger;
  getRecentWebviewContextId = commands.contextExtensions.getRecentWebviewContextId;
  isWebContext = commands.contextExtensions.isWebContext;
  isWebview = commands.contextExtensions.isWebview;
  setCurrentUrl = commands.contextExtensions.setCurrentUrl;
  stopRemote = commands.contextExtensions.stopRemote;

  /*------------+
   | DEVICEINFO |
   +------------+*/

  mobileGetDeviceInfo = commands.deviceInfoExtensions.mobileGetDeviceInfo;

  /*---------+
   | ELEMENT |
   +---------+*/

  elementDisplayed = commands.elementExtensions.elementDisplayed;
  elementEnabled = commands.elementExtensions.elementEnabled;
  elementSelected = commands.elementExtensions.elementSelected;
  getName = commands.elementExtensions.getName;
  getNativeAttribute = commands.elementExtensions.getNativeAttribute;
  getAttribute = commands.elementExtensions.getAttribute;
  getProperty = commands.elementExtensions.getProperty;
  getText = commands.elementExtensions.getText;
  getElementRect = commands.elementExtensions.getElementRect;
  getLocation = commands.elementExtensions.getLocation;
  getLocationInView = commands.elementExtensions.getLocationInView;
  getSize = commands.elementExtensions.getSize;
  /** @deprecated */
  setValueImmediate = commands.elementExtensions.setValueImmediate;
  setValue = commands.elementExtensions.setValue;
  setValueWithWebAtom = commands.elementExtensions.setValueWithWebAtom;
  keys = commands.elementExtensions.keys;
  clear = commands.elementExtensions.clear;
  getContentSize = commands.elementExtensions.getContentSize;
  getNativeRect = commands.elementExtensions.getNativeRect;

  /*---------+
   | EXECUTE |
   +---------+*/

  receiveAsyncResponse = commands.executeExtensions.receiveAsyncResponse;
  execute = commands.executeExtensions.execute;
  executeAsync = commands.executeExtensions.executeAsync;
  executeMobile = commands.executeExtensions.executeMobile;

  /*--------------+
   | FILEMOVEMENT |
   +--------------+*/

  pushFile = commands.fileMovementExtensions.pushFile;
  mobilePushFile = commands.fileMovementExtensions.mobilePushFile;
  pullFile = commands.fileMovementExtensions.pullFile;
  mobilePullFile = commands.fileMovementExtensions.mobilePullFile;
  mobileDeleteFolder = commands.fileMovementExtensions.mobileDeleteFolder;
  mobileDeleteFile = commands.fileMovementExtensions.mobileDeleteFile;
  pullFolder = commands.fileMovementExtensions.pullFolder;
  mobilePullFolder = commands.fileMovementExtensions.mobilePullFolder;

  /*--------+
   | MEMORY |
   +--------+*/

  mobileSendMemoryWarning = commands.memoryExtensions.mobileSendMemoryWarning;

  /*------+
   | FIND |
   +------+*/

  findElOrEls = commands.findExtensions.findElOrEls;
  findNativeElementOrElements = commands.findExtensions.findNativeElementOrElements;
  doNativeFind = commands.findExtensions.doNativeFind;
  getFirstVisibleChild = commands.findExtensions.getFirstVisibleChild;

  /*---------+
   | GENERAL |
   +---------+*/

  active = commands.generalExtensions.active;
  background = commands.appManagementExtensions.background;
  touchId = commands.generalExtensions.touchId;
  toggleEnrollTouchId = commands.generalExtensions.toggleEnrollTouchId;
  getWindowSize = commands.generalExtensions.getWindowSize;
  getDeviceTime = commands.generalExtensions.getDeviceTime;
  mobileGetDeviceTime = commands.generalExtensions.mobileGetDeviceTime;
  getWindowRect = commands.generalExtensions.getWindowRect;
  getStrings = commands.appStringsExtensions.getStrings;
  removeApp = commands.generalExtensions.removeApp;
  launchApp = commands.generalExtensions.launchApp;
  closeApp = commands.generalExtensions.closeApp;
  setUrl = commands.generalExtensions.setUrl;
  getViewportRect = commands.generalExtensions.getViewportRect;
  getScreenInfo = commands.generalExtensions.getScreenInfo;
  getStatusBarHeight = commands.generalExtensions.getStatusBarHeight;
  getDevicePixelRatio = commands.generalExtensions.getDevicePixelRatio;
  mobilePressButton = commands.generalExtensions.mobilePressButton;
  mobileSiriCommand = commands.generalExtensions.mobileSiriCommand;
  getWindowSizeWeb = commands.generalExtensions.getWindowSizeWeb;
  getWindowSizeNative = commands.generalExtensions.getWindowSizeNative;

  /*-------------+
   | GEOLOCATION |
   +-------------+*/
  mobileGetSimulatedLocation = commands.geolocationExtensions.mobileGetSimulatedLocation;
  mobileSetSimulatedLocation = commands.geolocationExtensions.mobileSetSimulatedLocation;
  mobileResetSimulatedLocation = commands.geolocationExtensions.mobileResetSimulatedLocation;

  /*---------+
   | GESTURE |
   +---------+*/
  mobileShake = commands.gestureExtensions.mobileShake;
  click = commands.gestureExtensions.click;
  releaseActions = commands.gestureExtensions.releaseActions;
  performActions = commands.gestureExtensions.performActions;
  nativeClick = commands.gestureExtensions.nativeClick;
  mobileScrollToElement = commands.gestureExtensions.mobileScrollToElement;
  mobileScroll = commands.gestureExtensions.mobileScroll;
  mobileSwipe = commands.gestureExtensions.mobileSwipe;
  mobilePinch = commands.gestureExtensions.mobilePinch;
  mobileDoubleTap = commands.gestureExtensions.mobileDoubleTap;
  mobileTwoFingerTap = commands.gestureExtensions.mobileTwoFingerTap;
  mobileTouchAndHold = commands.gestureExtensions.mobileTouchAndHold;
  mobileTap = commands.gestureExtensions.mobileTap;
  mobileDragFromToForDuration = commands.gestureExtensions.mobileDragFromToForDuration;
  mobileDragFromToWithVelocity = commands.gestureExtensions.mobileDragFromToWithVelocity;
  mobileTapWithNumberOfTaps = commands.gestureExtensions.mobileTapWithNumberOfTaps;
  mobileForcePress = commands.gestureExtensions.mobileForcePress;
  mobileSelectPickerWheelValue = commands.gestureExtensions.mobileSelectPickerWheelValue;
  mobileRotateElement = commands.gestureExtensions.mobileRotateElement;

  /*-------+
   | IOHID |
   +-------+*/
  mobilePerformIoHidEvent = commands.iohidExtensions.mobilePerformIoHidEvent;

  /*-----------+
   | KEYCHAINS |
   +-----------+*/

  mobileClearKeychains = commands.keychainsExtensions.mobileClearKeychains;

  /*----------+
   | KEYBOARD |
   +----------+*/

  hideKeyboard = commands.keyboardExtensions.hideKeyboard;
  mobileHideKeyboard = commands.keyboardExtensions.mobileHideKeyboard;
  isKeyboardShown = commands.keyboardExtensions.isKeyboardShown;
  mobileKeys = commands.keyboardExtensions.mobileKeys;

  /*--------------+
   | LOCALIZATION |
   +--------------+*/

  mobileConfigureLocalization = commands.localizationExtensions.mobileConfigureLocalization;

  /*----------+
   | LOCATION |
   +----------+*/

  getGeoLocation = commands.locationExtensions.getGeoLocation;
  setGeoLocation = commands.locationExtensions.setGeoLocation;
  mobileResetLocationService = commands.locationExtensions.mobileResetLocationService;

  /*------+
   | LOCK |
   +------+*/
  lock = commands.lockExtensions.lock;
  unlock = commands.lockExtensions.unlock;
  isLocked = commands.lockExtensions.isLocked;

  /*-----+
   | LOG |
   +-----+*/

  extractLogs = commands.logExtensions.extractLogs;
  supportedLogTypes = commands.logExtensions.supportedLogTypes;
  startLogCapture = commands.logExtensions.startLogCapture;
  mobileStartLogsBroadcast = commands.logExtensions.mobileStartLogsBroadcast;
  mobileStopLogsBroadcast = commands.logExtensions.mobileStopLogsBroadcast;

  /*------------+
   | NAVIGATION |
   +------------+*/

  back = commands.navigationExtensions.back;
  forward = commands.navigationExtensions.forward;
  closeWindow = commands.navigationExtensions.closeWindow;
  nativeBack = commands.navigationExtensions.nativeBack;
  mobileDeepLink = commands.navigationExtensions.mobileDeepLink;

  /*---------------+
   | NOTIFICATIONS |
   +---------------+*/

  mobilePushNotification = commands.notificationsExtensions.mobilePushNotification;
  mobileExpectNotification = commands.notificationsExtensions.mobileExpectNotification;

  /*------------+
   | PASTEBOARD |
   +------------+*/

  mobileSetPasteboard = commands.pasteboardExtensions.mobileSetPasteboard;
  mobileGetPasteboard = commands.pasteboardExtensions.mobileGetPasteboard;

  /*------+
   | PCAP |
   +------+*/

  mobileStartPcap = commands.pcapExtensions.mobileStartPcap;
  mobileStopPcap = commands.pcapExtensions.mobileStopPcap;

  /*-------------+
   | PERFORMANCE |
   +-------------+*/
  mobileStartPerfRecord = commands.performanceExtensions.mobileStartPerfRecord;
  mobileStopPerfRecord = commands.performanceExtensions.mobileStopPerfRecord;

  /*-------------+
   | PERMISSIONS |
   +-------------+*/

  mobileResetPermission = commands.permissionsExtensions.mobileResetPermission;
  mobileGetPermission = commands.permissionsExtensions.mobileGetPermission;
  mobileSetPermissions = commands.permissionsExtensions.mobileSetPermissions;

  /*-------------+
   | PROXYHELPER |
   +-------------+*/

  proxyCommand = commands.proxyHelperExtensions.proxyCommand;

  /*-------------+
   | RECORDAUDIO |
   +-------------+*/

  startAudioRecording = commands.recordAudioExtensions.startAudioRecording;
  stopAudioRecording = commands.recordAudioExtensions.stopAudioRecording;

  /*--------------+
   | RECORDSCREEN |
   +--------------+*/

  _recentScreenRecorder = commands.recordScreenExtensions._recentScreenRecorder;
  startRecordingScreen = commands.recordScreenExtensions.startRecordingScreen;
  stopRecordingScreen = commands.recordScreenExtensions.stopRecordingScreen;

  /*-------------+
   | SCREENSHOTS |
   +-------------+*/
  getScreenshot = commands.screenshotExtensions.getScreenshot;
  getElementScreenshot = commands.screenshotExtensions.getElementScreenshot;
  getViewportScreenshot = commands.screenshotExtensions.getViewportScreenshot;

  /*--------+
   | SOURCE |
   +--------+*/
  getPageSource = commands.sourceExtensions.getPageSource;
  mobileGetSource = commands.sourceExtensions.mobileGetSource;

  /*----------+
   | TIMEOUTS |
   +----------+*/

  pageLoadTimeoutW3C = commands.timeoutExtensions.pageLoadTimeoutW3C;
  pageLoadTimeoutMJSONWP = commands.timeoutExtensions.pageLoadTimeoutMJSONWP;
  scriptTimeoutW3C = commands.timeoutExtensions.scriptTimeoutW3C;
  scriptTimeoutMJSONWP = commands.timeoutExtensions.scriptTimeoutMJSONWP;
  asyncScriptTimeout = commands.timeoutExtensions.asyncScriptTimeout;
  setPageLoadTimeout = commands.timeoutExtensions.setPageLoadTimeout;
  setAsyncScriptTimeout = commands.timeoutExtensions.setAsyncScriptTimeout;

  /*-----+
   | WEB |
   +-----+*/
  setFrame = commands.webExtensions.setFrame;
  getCssProperty = commands.webExtensions.getCssProperty;
  submit = commands.webExtensions.submit;
  refresh = commands.webExtensions.refresh;
  getUrl = commands.webExtensions.getUrl;
  title = commands.webExtensions.title;
  getCookies = commands.webExtensions.getCookies;
  setCookie = commands.webExtensions.setCookie;
  deleteCookie = commands.webExtensions.deleteCookie;
  deleteCookies = commands.webExtensions.deleteCookies;
  _deleteCookie = commands.webExtensions._deleteCookie;
  cacheWebElement = commands.webExtensions.cacheWebElement;
  cacheWebElements = commands.webExtensions.cacheWebElements;
  executeAtom = commands.webExtensions.executeAtom;
  executeAtomAsync = commands.webExtensions.executeAtomAsync;
  getAtomsElement = commands.webExtensions.getAtomsElement;
  convertElementsForAtoms = commands.webExtensions.convertElementsForAtoms;
  getElementId = commands.webExtensions.getElementId;
  hasElementId = commands.webExtensions.hasElementId;
  findWebElementOrElements = commands.webExtensions.findWebElementOrElements;
  clickWebCoords = commands.webExtensions.clickWebCoords;
  getSafariIsIphone = commands.webExtensions.getSafariIsIphone;
  getSafariDeviceSize = commands.webExtensions.getSafariDeviceSize;
  getSafariIsNotched = commands.webExtensions.getSafariIsNotched;
  getExtraTranslateWebCoordsOffset = commands.webExtensions.getExtraTranslateWebCoordsOffset;
  getExtraNativeWebTapOffset = commands.webExtensions.getExtraNativeWebTapOffset;
  nativeWebTap = commands.webExtensions.nativeWebTap;
  translateWebCoords = commands.webExtensions.translateWebCoords;
  checkForAlert = commands.webExtensions.checkForAlert;
  waitForAtom = commands.webExtensions.waitForAtom;
  mobileWebNav = commands.webExtensions.mobileWebNav;
  getWdaLocalhostRoot = commands.webExtensions.getWdaLocalhostRoot;
  mobileCalibrateWebToRealCoordinatesTranslation = commands.webExtensions.mobileCalibrateWebToRealCoordinatesTranslation;
  mobileUpdateSafariPreferences = commands.webExtensions.mobileUpdateSafariPreferences;

  /*--------+
   | XCTEST |
   +--------+*/
  mobileRunXCTest = commands.xctestExtensions.mobileRunXCTest;
  mobileInstallXCTestBundle = commands.xctestExtensions.mobileInstallXCTestBundle;
  mobileListXCTestBundles = commands.xctestExtensions.mobileListXCTestBundles;
  mobileListXCTestsInTestBundle = commands.xctestExtensions.mobileListXCTestsInTestBundle;

  /*----------------------+
   | XCTEST SCREEN RECORD |
   +---------------------+*/
  mobileStartXctestScreenRecording = commands.xctestRecordScreenExtensions.mobileStartXctestScreenRecording;
  mobileGetXctestScreenRecordingInfo = commands.xctestRecordScreenExtensions.mobileGetXctestScreenRecordingInfo;
  mobileStopXctestScreenRecording = commands.xctestRecordScreenExtensions.mobileStopXctestScreenRecording;
}

/**
 * @param {XCUITestDriverOpts} opts
 * @returns {boolean}
 */
function shouldSetInitialSafariUrl(opts) {
  return !(opts.safariInitialUrl === '' || (opts.noReset && _.isNil(opts.safariInitialUrl)))
    && !opts.initialDeeplinkUrl;
}

export default XCUITestDriver;

/**
 * @template {import('@appium/types').Constraints} C
 * @template [Ctx=string]
 * @typedef {import('@appium/types').ExternalDriver<C, Ctx>} ExternalDriver
 */

/**
 * @typedef {Pick<XCUITestDriverOpts, 'enforceAppInstall' | 'fullReset' | 'noReset' | 'bundleId' | 'app'>} AutInstallationStateOptions
 */

/**
 * @typedef {Object} AutInstallationState
 * @property {boolean} install - If the given app should install, or not need to install.
 * @property {boolean} skipUninstall - If the installed app should be uninstalled, or not.
 */

/**
 * @typedef {typeof desiredCapConstraints} XCUITestDriverConstraints
 * @typedef {import('@appium/types').DriverOpts<XCUITestDriverConstraints>} XCUITestDriverOpts
 * @typedef {import('./commands/types').FullContext} FullContext
 * @typedef {import('appium-xcode').XcodeVersion} XcodeVersion
 * @typedef {import('appium-ios-simulator').Simulator} Simulator
 */
