import IDB from 'appium-idb';
import {getSimulator} from 'appium-ios-simulator';
import {WebDriverAgent, type WebDriverAgentArgs} from 'appium-webdriveragent';
import {BaseDriver, DeviceSettings, errors} from 'appium/driver';
import {fs, mjpeg, util, timing} from 'appium/support';
import type {
  RouteMatcher,
  DefaultCreateSessionResult,
  DriverData,
  StringRecord,
  ExternalDriver,
  W3CDriverCaps,
  DriverCaps,
  DriverOpts,
} from '@appium/types';
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
import * as activeAppInfoCommands from './commands/active-app-info';
import * as alertCommands from './commands/alert';
import * as appManagementCommands from './commands/app-management';
import * as appearanceCommands from './commands/appearance';
import * as appStringsCommands from './commands/app-strings';
import * as auditCommands from './commands/audit';
import * as batteryCommands from './commands/battery';
import * as biometricCommands from './commands/biometric';
import * as certificateCommands from './commands/certificate';
import * as clipboardCommands from './commands/clipboard';
import * as conditionCommands from './commands/condition';
import * as contentSizeCommands from './commands/content-size';
import * as contextCommands from './commands/context';
import * as deviceInfoCommands from './commands/deviceInfo';
import * as elementCommands from './commands/element';
import * as executeCommands from './commands/execute';
import * as fileMovementCommands from './commands/file-movement';
import * as findCommands from './commands/find';
import * as generalCommands from './commands/general';
import * as geolocationCommands from './commands/geolocation';
import * as gestureCommands from './commands/gesture';
import * as iohidCommands from './commands/iohid';
import * as keychainsCommands from './commands/keychains';
import * as keyboardCommands from './commands/keyboard';
import * as localizationCommands from './commands/localization';
import * as locationCommands from './commands/location';
import * as lockCommands from './commands/lock';
import * as logCommands from './commands/log';
import * as memoryCommands from './commands/memory';
import * as navigationCommands from './commands/navigation';
import * as notificationsCommands from './commands/notifications';
import * as pasteboardCommands from './commands/pasteboard';
import * as pcapCommands from './commands/pcap';
import * as performanceCommands from './commands/performance';
import * as permissionsCommands from './commands/permissions';
import * as proxyHelperCommands from './commands/proxy-helper';
import * as recordAudioCommands from './commands/record-audio';
import * as recordScreenCommands from './commands/recordscreen';
import * as screenshotCommands from './commands/screenshots';
import * as sourceCommands from './commands/source';
import * as simctlCommands from './commands/simctl';
import * as timeoutCommands from './commands/timeouts';
import * as webCommands from './commands/web';
import * as xctestCommands from './commands/xctest';
import * as xctestRecordScreenCommands from './commands/xctest-record-screen';
import * as increaseContrastCommands from './commands/increase-contrast';
import {desiredCapConstraints, type XCUITestDriverConstraints} from './desired-caps';
import {DEVICE_CONNECTIONS_FACTORY} from './device/device-connections-factory';
import {executeMethodMap} from './execute-method-map';
import {newMethodMap} from './method-map';
import { Pyidevice } from './device/clients/py-ios-device-client';
import {
  installToRealDevice,
  runRealDeviceReset,
  applySafariStartupArgs,
  detectUdid,
  RealDevice,
  getConnectedDevices,
} from './device/real-device-management';
import {
  createSim,
  getExistingSim,
  installToSimulator,
  runSimulatorReset,
  setLocalizationPrefs,
  setSafariPrefs,
  shutdownOtherSimulators,
  shutdownSimulator,
} from './device/simulator-management';
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
  shouldSetInitialSafariUrl,
} from './utils';
import { AppInfosCache } from './app-infos-cache';
import { notifyBiDiContextChange } from './commands/context';
import type { CalibrationData, AsyncPromise, LifecycleData } from './types';
import type { WaitingAtoms, LogListener, FullContext } from './commands/types';
import type { PerfRecorder } from './commands/performance';
import type { AudioRecorder } from './commands/record-audio';
import type { TrafficCapture } from './commands/pcap';
import type { ScreenRecorder } from './commands/recordscreen';
import type { DVTServiceWithConnection } from './commands/condition.js';
import type { IOSDeviceLog } from './device/log/ios-device-log';
import type { IOSSimulatorLog } from './device/log/ios-simulator-log';
import type { IOSCrashLog } from './device/log/ios-crash-log';
import type { SafariConsoleLog } from './device/log/safari-console-log';
import type { SafariNetworkLog } from './device/log/safari-network-log';
import type { IOSPerformanceLog } from './device/log/ios-performance-log';
import type { RemoteDebugger } from 'appium-remote-debugger';
import type { XcodeVersion } from 'appium-xcode';
import type { Simulator } from 'appium-ios-simulator';

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
const DEFAULT_MJPEG_SERVER_PORT = 9100;

/* eslint-disable no-useless-escape */
const NO_PROXY_NATIVE_LIST: RouteMatcher[] = [
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
] as RouteMatcher[];

const NO_PROXY_WEB_LIST: RouteMatcher[] = [
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
  ...NO_PROXY_NATIVE_LIST,
] as RouteMatcher[];
/* eslint-enable no-useless-escape */

const MEMOIZED_FUNCTIONS = ['getStatusBarHeight', 'getDevicePixelRatio', 'getScreenInfo'];

// Capabilities that do not have xcodebuild process
const CAP_NAMES_NO_XCODEBUILD_REQUIRED = ['webDriverAgentUrl', 'usePreinstalledWDA'];

const BUNDLE_VERSION_PATTERN = /CFBundleVersion\s+=\s+"?([^(;|")]+)/;

export class XCUITestDriver
  extends BaseDriver<XCUITestDriverConstraints, StringRecord>
  implements ExternalDriver<XCUITestDriverConstraints, FullContext|string, StringRecord> {
  static newMethodMap = newMethodMap;

  static executeMethodMap = executeMethodMap;

  curWindowHandle: string | null | undefined;
  selectingNewPage: boolean | undefined;
  contexts: string[];
  curContext: string | null;
  curWebFrames: string[];

  webviewCalibrationResult: CalibrationData | null;
  asyncPromise: AsyncPromise | undefined;
  asyncWaitMs: number | undefined;
  _syslogWebsocketListener: ((logRecord: {message: string}) => void) | null;
  _perfRecorders: PerfRecorder[];
  webElementsCache: LRUCache<any, any>;

  _conditionInducerService: any | null; // needs types
  _remoteXPCConditionInducerConnection: DVTServiceWithConnection | null; // RemoteXPC DVT connection for iOS>=18 condition inducer
  _isSafariIphone: boolean | undefined;
  _isSafariNotched: boolean | undefined;
  _waitingAtoms: WaitingAtoms;
  lifecycleData: LifecycleData;

  _audioRecorder: AudioRecorder | null;
  xcodeVersion: XcodeVersion | undefined;
  _trafficCapture: TrafficCapture | null;
  _recentScreenRecorder: ScreenRecorder | null;
  _device: Simulator | RealDevice;
  _iosSdkVersion: string | null;
  _wda: WebDriverAgent | null;
  remote: RemoteDebugger | null;
  logs: DriverLogs;
  _bidiServerLogListener: LogListener | undefined;

  // Additional properties that were missing
  appInfosCache: AppInfosCache;
  doesSupportBidi: boolean;
  jwpProxyActive: boolean;
  proxyReqRes: ((...args: any[]) => any) | null;
  safari: boolean;
  cachedWdaStatus: any;
  _currentUrl: string | null;
  pageLoadMs: number;
  landscapeWebCoordsOffset: number;
  mjpegStream?: mjpeg.MJpegStream;

  constructor(opts: XCUITestDriverOpts, shouldValidateCaps = true) {
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
    this.doesSupportBidi = true;
    this._wda = null;
  }

  // Override methods from BaseDriver
  override async createSession(
    w3cCaps1: W3CXCUITestDriverCaps,
    w3cCaps2?: W3CXCUITestDriverCaps,
    w3cCaps3?: W3CXCUITestDriverCaps,
    driverData?: DriverData[]
  ): Promise<DefaultCreateSessionResult<XCUITestDriverConstraints>> {
    try {
      const [sessionId, initialCaps] = await super.createSession(w3cCaps1, w3cCaps2, w3cCaps3, driverData);
      let caps = initialCaps;

      // merge cli args to opts, and if we did merge any, revalidate opts to ensure the final set
      // is also consistent
      if (this.mergeCliArgsToOpts()) {
        this.validateDesiredCaps({...caps, ...this.cliArgs});
      }

      await this.start();

      // merge server capabilities + desired capabilities
      caps = { ...defaultServerCaps, ...caps };
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

      const wdaSettings: StringRecord = {
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

      await this.handleMjpegOptions();

      return [
        sessionId,
        caps,
      ];
    } catch (e) {
      this.log.error(JSON.stringify(e));
      await this.deleteSession();
      throw e;
    }
  }

  override async deleteSession(sessionId?: string): Promise<void> {
    await removeAllSessionWebSocketHandlers.bind(this)();

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

    if (this._conditionInducerService || this._remoteXPCConditionInducerConnection) {
      try {
        await this.disableConditionInducer();
      } catch (err) {
        this.log.warn(`Cannot disable condition inducer: ${err.message}`);
      }
    }

    await this.stop();

    if (this._wda && this.isXcodebuildNeeded()) {
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

    const simulatorDevice = this.isSimulator() ? this.device as Simulator : null;
    if (simulatorDevice && this.lifecycleData.createSim) {
      this.log.debug(`Deleting simulator created for this run (udid: '${simulatorDevice.udid}')`);
      await shutdownSimulator.bind(this)();
      await simulatorDevice.delete();
    }

    const shouldResetLocationService = this.isRealDevice() && !!this.opts.resetLocationService;
    if (shouldResetLocationService) {
      try {
        await this.mobileResetLocationService();
      } catch {
        /* Ignore this error since mobileResetLocationService already logged the error */
      }
    }

    await this.logs.syslog?.stopCapture();
    _.values(this.logs).forEach((x: any) => x?.removeAllListeners?.());
    if (this._bidiServerLogListener) {
      this.log.unwrap().off('log', this._bidiServerLogListener);
    }
    this.logs = {};

    if (this.mjpegStream) {
      this.log.info('Closing MJPEG stream');
      this.mjpegStream.stop();
    }

    this.resetIos();

    await super.deleteSession(sessionId);
  }

  override async executeCommand(cmd: string, ...args: any[]): Promise<any> {
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

  override proxyActive(): boolean {
    return Boolean(this.jwpProxyActive);
  }

  override getProxyAvoidList(): RouteMatcher[] {
    if (this.isWebview()) {
      return NO_PROXY_WEB_LIST;
    }
    return NO_PROXY_NATIVE_LIST;
  }

  override canProxy(): boolean {
    return true;
  }

  override validateLocatorStrategy(strategy: string): void {
    super.validateLocatorStrategy(strategy, this.isWebContext());
  }

  override validateDesiredCaps(caps: any): caps is DriverCaps<XCUITestDriverConstraints> {
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

    const verifyProcessArgument = (processArguments) => {
      const {args, env} = processArguments;
      if (!_.isNil(args) && !_.isArray(args)) {
        throw this.log.errorWithException('processArguments.args must be an array of strings');
      }
      if (!_.isNil(env) && !_.isPlainObject(env)) {
        throw this.log.errorWithException(
          'processArguments.env must be an object <key,value> pair {a:b, c:d}',
        );
      }
    };

    // `processArguments` should be JSON string or an object with arguments and/ environment details
    if (caps.processArguments) {
      if (_.isString(caps.processArguments)) {
        try {
          // try to parse the string as JSON
          caps.processArguments = JSON.parse(caps.processArguments as string);
          verifyProcessArgument(caps.processArguments);
        } catch (err) {
          throw this.log.errorWithException(
            `processArguments must be a JSON format or an object with format {args : [], env : {a:b, c:d}}. ` +
              `Both environment and argument can be null. Error: ${err}`,
          );
        }
      } else if (_.isPlainObject(caps.processArguments)) {
        verifyProcessArgument(caps.processArguments);
      } else {
        throw this.log.errorWithException(
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
      throw this.log.errorWithException(
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
        throw this.log.errorWithException(
          `'webDriverAgentUrl' capability is expected to contain a valid WebDriverAgent server URL. ` +
            `'${caps.webDriverAgentUrl}' is given instead`,
        );
      }
    }

    if (caps.browserName) {
      if (caps.bundleId) {
        throw this.log.errorWithException(
          `'browserName' cannot be set together with 'bundleId' capability`
        );
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
        throw this.log.errorWithException(
          `'${caps.permissions}' is expected to be a valid object with format ` +
            `{"<bundleId1>": {"<serviceName1>": "<serviceStatus1>", ...}, ...}. Original error: ${e.message}`,
        );
      }
    }

    if (caps.platformVersion && !util.coerceVersion(caps.platformVersion, false)) {
      throw this.log.errorWithException(
        `'platformVersion' must be a valid version number. ` +
          `'${caps.platformVersion}' is given instead.`,
      );
    }

    // additionalWebviewBundleIds is an array, JSON array, or string
    if (caps.additionalWebviewBundleIds) {
        caps.additionalWebviewBundleIds = this.helpers.parseCapsArray(
          caps.additionalWebviewBundleIds as string | string[],
        );
    }

    // finally, return true since the superclass check passed, as did this
    return true;
  }

  // Getter methods
  get wda(): WebDriverAgent {
    if (!this._wda) {
      throw new Error('WebDriverAgent is not initialized');
    }
    return this._wda;
  }

  get driverData(): Record<string, any> {
    // TODO fill out resource info here
    return {};
  }

  get device(): Simulator | RealDevice {
    return this._device;
  }

  // Utility methods
  isSafari(): boolean {
    return !!this.safari;
  }

  isRealDevice(): boolean {
    return 'devicectl' in (this.device ?? {});
  }

  isSimulator(): boolean {
    return 'simctl' in (this.device ?? {});
  }

  isXcodebuildNeeded(): boolean {
    return !(CAP_NAMES_NO_XCODEBUILD_REQUIRED.some((x) => Boolean(this.opts[x])));
  }

  // Core driver methods
  async onSettingsUpdate(key: string, value: any): Promise<any> {
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

  async getStatus(): Promise<Record<string, any>> {
    const status = {
      ready: true,
      message: 'The driver is ready to accept new connections',
      build: await getDriverInfo(),
    };
    if (this.cachedWdaStatus) {
      (status as any).wda = this.cachedWdaStatus;
    }
    return status;
  }

  mergeCliArgsToOpts(): boolean {
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

  async handleMjpegOptions(): Promise<void> {
    await this.allocateMjpegServerPort();
    // turn on mjpeg stream reading if requested
    if (this.opts.mjpegScreenshotUrl) {
      this.log.info(`Starting MJPEG stream reading URL: '${this.opts.mjpegScreenshotUrl}'`);
      this.mjpegStream = new mjpeg.MJpegStream(this.opts.mjpegScreenshotUrl);
      await this.mjpegStream.start();
    }
  }

  async allocateMjpegServerPort(): Promise<void> {
    const mjpegServerPort = this.opts.mjpegServerPort || DEFAULT_MJPEG_SERVER_PORT;
    this.log.debug(
      `Forwarding MJPEG server port ${mjpegServerPort} to local port ${mjpegServerPort}`,
    );
    try {
      await DEVICE_CONNECTIONS_FACTORY.requestConnection(this.opts.udid, mjpegServerPort, {
        devicePort: mjpegServerPort,
        usePortForwarding: this.isRealDevice(),
      });
    } catch (error) {
      if (_.isUndefined(this.opts.mjpegServerPort)) {
        this.log.warn(
          `Cannot forward the device port ${DEFAULT_MJPEG_SERVER_PORT} to the local port ${DEFAULT_MJPEG_SERVER_PORT}. ` +
            `Certain features, like MJPEG-based screen recording, will be unavailable during this session. ` +
            `Try to customize the value of 'mjpegServerPort' capability as a possible solution`,
        );
      } else {
        this.log.debug(error.stack);
        throw new Error(
          `Cannot ensure MJPEG broadcast functionality by forwarding the local port ${mjpegServerPort} ` +
            `requested by the 'mjpegServerPort' capability to the device port ${mjpegServerPort}. ` +
            `Original error: ${error}`,
        );
      }
    }
  }

  getDefaultUrl(): string {
    // Setting this to some external URL slows down the session init
    return `${this.getWdaLocalhostRoot()}/health`;
  }

  async start(): Promise<void> {
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
        (this.device as Simulator).devicesSetPath = this.opts.simulatorDevicesSetPath;
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

    this._wda = new WebDriverAgent(
      // @ts-ignore This property is not used by WDA, and will be removed in the future
      this.xcodeVersion,
      {
        ...this.opts,
        device: this.device,
        realDevice: this.isRealDevice(),
        iosSdkVersion: this._iosSdkVersion ?? undefined,
        reqBasePath: this.basePath,
      } as WebDriverAgentArgs,
      this.log,
    );
    // Derived data path retrieval is an expensive operation
    // We could start that now in background and get the cached result
    // whenever it is needed
    (
      async () => {
        try {
          await this.wda.retrieveDerivedDataPath();
        } catch (e) {
          this.log.debug(e);
        }
      }
    )();

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
      await new Pyidevice({
        udid,
        log: this.log,
      }).installProfile({payload: this.opts.customSSLCert});
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
      throw this.log.errorWithException(`App with bundle identifier '${this.opts.bundleId}' unknown`);
    }

    if (this.isSimulator()) {
      if (this.opts.permissions) {
        this.log.debug('Setting the requested permissions before WDA is started');
        for (const [bundleId, permissionsMapping] of _.toPairs(JSON.parse(this.opts.permissions as string))) {
          await (this.device as Simulator).setPermissions(bundleId, permissionsMapping as StringRecord);
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
    } else {
      // We want to always setup the initial context value upon session startup
      await notifyBiDiContextChange.bind(this)();
    }
    if (this.isSafari()) {
      if (shouldSetInitialSafariUrl(this.opts)) {
        this.log.info(`About to set the initial Safari URL to '${this.getCurrentUrl()}'`);
        if (_.isNil(this.opts.safariInitialUrl) && _.isNil(this.opts.initialDeeplinkUrl)) {
          this.log.info(`Use the 'safariInitialUrl' capability to customize it`);
        };
        await this.setUrl(this.getCurrentUrl() || this.getDefaultUrl());
      } else {
        const currentUrl = await this.getUrl();
        this.log.info(`Current URL: ${currentUrl}`);
        this.setCurrentUrl(currentUrl);
      }
    }
  }

  async runReset(enforceSimulatorShutdown = false): Promise<void> {
    this.logEvent('resetStarted');
    if (this.isRealDevice()) {
      await runRealDeviceReset.bind(this)();
    } else {
      await runSimulatorReset.bind(this)(enforceSimulatorShutdown);
    }
    this.logEvent('resetComplete');
  }

  async stop(): Promise<void> {
    this.jwpProxyActive = false;
    this.proxyReqRes = null;

    if (this._wda?.fullyStarted) {
      if (this.wda.jwproxy) {
        try {
          await this.proxyCommand(`/session/${this.sessionId}`, 'DELETE');
        } catch (err) {
          // an error here should not short-circuit the rest of clean up
          this.log.debug(`Unable to DELETE session on WDA: '${err.message}'. Continuing shutdown.`);
        }
      }
      // The former could cache the xcodebuild, so should not quit the process.
      // If the session skipped the xcodebuild (this.wda.canSkipXcodebuild), the this.wda instance
      // should quit properly.
      if ((!this.wda.webDriverAgentUrl && this.opts.useNewWDA) || this.wda.canSkipXcodebuild) {
        await this.wda.quit();
      }
    }
    DEVICE_CONNECTIONS_FACTORY.releaseConnection(this.opts.udid);
  }

  async initSimulator(): Promise<void> {
    const device = this.device as Simulator;

    if (this.opts.shutdownOtherSimulators) {
      this.assertFeatureEnabled(SHUTDOWN_OTHER_FEAT_NAME);
      await shutdownOtherSimulators.bind(this)();
    }

    await this.startSim();

    if (this.opts.customSSLCert) {
      // Simulator must be booted in order to call this helper
      await (device as Simulator).addCertificate(this.opts.customSSLCert);
      this.logEvent('customCertInstalled');
    }

    if (await setSafariPrefs.bind(this)()) {
      this.log.debug('Safari preferences have been updated');
    }

    if (await setLocalizationPrefs.bind(this)()) {
      this.log.debug('Localization preferences have been updated');
    }

    const promises: Promise<any>[] = ['reduceMotion', 'reduceTransparency', 'autoFillPasswords']
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
        // @ts-ignore This is ok. We are going to ditch idb soon anyway
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

  async startWda(): Promise<void> {
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

      let shortCircuitError: Error | null = null;
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

          if (!this.sessionId) {
            throw new Error('Session ID is required but was not set');
          }
          this.cachedWdaStatus = await this.wda.launch(this.sessionId);
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
            } catch {};
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

        // We don't restrict the version, but show what version of WDA is running on the device for debugging purposes.
        if (this.cachedWdaStatus?.build) {
          this.log.info(`WebDriverAgent version: '${this.cachedWdaStatus.build.version}'`);
        } else {
          this.log.warn(
            `WebDriverAgent does not provide any version information. ` +
              `This might indicate either a custom or an outdated build.`
          );
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



  async configureApp(): Promise<void> {
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
        this.opts.app = undefined;
        return;
      case 'calendar':
        this.opts.bundleId = 'com.apple.mobilecal';
        this.opts.app = undefined;
        return;
    }

    this.opts.app = await this.helpers.configureApp(this.opts.app as string, {
      onPostProcess: onPostConfigureApp.bind(this),
      onDownload: onDownloadApp.bind(this),
      supportedExtensions: SUPPORTED_EXTENSIONS,
    });
  }



  async determineDevice(): Promise<{device: Simulator | RealDevice, realDevice: boolean, udid: string}> {
    // in the one case where we create a sim, we will set this state
    this.lifecycleData.createSim = false;

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
      const device = new RealDevice(this.opts.udid as string, this.log);
      return {device, realDevice: true, udid: this.opts.udid as string};
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

  async startSim(): Promise<void> {
    const devicePreferences: any = {};
    const runOpts: any = {
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
    const orientation = _.isString(this.opts.orientation) && (this.opts.orientation as string).toUpperCase();
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

    await (this.device as Simulator).run(runOpts);
  }

  async createSim(): Promise<Simulator> {
    this.lifecycleData.createSim = true;
    // create sim for caps
    const sim = await createSim.bind(this)();
    this.log.info(`Created simulator with udid '${sim.udid}'.`);
    return sim;
  }

  async startWdaSession(bundleId?: string, processArguments?: any): Promise<void> {
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

    const wdaCaps: StringRecord = {
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

  async checkAutInstallationState(opts?: AutInstallationStateOptions): Promise<AutInstallationState> {
    const {enforceAppInstall, fullReset, noReset, bundleId, app} = opts ?? this.opts;

    const wasAppInstalled = !!bundleId && await this.device.isAppInstalled(bundleId);
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

    const candidateBundleVersion = app ? await this.appInfosCache.extractBundleVersion(app) : undefined;
    this.log.debug(`CFBundleVersion from Info.plist: ${candidateBundleVersion}`);
    if (!candidateBundleVersion) {
      return {
        install: true,
        skipUninstall: false,
      };
    }

    const appBundleVersion = this.isRealDevice()
      ? (await (this.device as RealDevice).fetchAppInfo(bundleId))?.CFBundleVersion
      : BUNDLE_VERSION_PATTERN.exec(await (this.device as Simulator).simctl.appInfo(bundleId))?.[1];
    this.log.debug(`CFBundleVersion from installed app info: ${appBundleVersion}`);
    if (!appBundleVersion) {
      return {
        install: true,
        skipUninstall: false,
      };
    }

    let shouldUpgrade: boolean;
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

  async installAUT(): Promise<void> {
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
        const pauseMs = this.opts.iosInstallPause;
        this.log.debug(`iosInstallPause set. Pausing ${pauseMs} ms before continuing`);
        await B.delay(pauseMs);
      }
      this.logEvent('appInstalled');
    }
  }

  async installOtherApps(otherApps: string | string[]): Promise<void> {
    let appsList: string[] | undefined;
    try {
      appsList = this.helpers.parseCapsArray(otherApps);
    } catch (e) {
      throw this.log.errorWithException(`Could not parse "otherApps" capability: ${e.message}`);
    }
    if (!appsList?.length) {
      this.log.info(`Got zero apps from 'otherApps' capability value. Doing nothing`);
      return;
    }

    const appPaths: string[] = await B.all(appsList.map((app) => this.helpers.configureApp(app, {
      onPostProcess: onPostConfigureApp.bind(this),
      onDownload: onDownloadApp.bind(this),
      supportedExtensions: SUPPORTED_EXTENSIONS,
    })));
    const appIds: string[] = await B.all(appPaths.map((appPath) => this.appInfosCache.extractBundleId(appPath)));
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

  async setInitialOrientation(orientation: string): Promise<void> {
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

  async reset(): Promise<never> {
    throw new Error(
      `The reset API has been deprecated and is not supported anymore. ` +
        `Consider using corresponding 'mobile:' extensions to manage the state of the app under test.`,
    );
  }

  async preparePreinstalledWda(): Promise<void> {
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
    // It may not be able to compare with the installed version.
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

  resetIos(): void {
    this.opts = this.opts || {};
    this._wda = null;
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
    this._remoteXPCConditionInducerConnection = null;

    this.webElementsCache = new LRUCache({
      max: WEB_ELEMENTS_CACHE_SIZE,
    });

    this._waitingAtoms = {
      count: 0,
      alertNotifier: new EventEmitter(),
      alertMonitor: B.resolve(),
    };
  }

  _getCommandTimeout(cmdName?: string): number | undefined {
    if (this.opts.commandTimeouts) {
      if (cmdName && _.has(this.opts.commandTimeouts, cmdName)) {
        return this.opts.commandTimeouts[cmdName];
      }
      return this.opts.commandTimeouts[DEFAULT_TIMEOUT_KEY];
    }
  }

  /*---------------+
   | ACTIVEAPPINFO |
   +---------------+*/

  mobileGetActiveAppInfo = activeAppInfoCommands.mobileGetActiveAppInfo;

  /*-------+
   | ALERT |
   +-------+*/
  getAlertText = alertCommands.getAlertText;
  setAlertText = alertCommands.setAlertText;
  postAcceptAlert = alertCommands.postAcceptAlert;
  postDismissAlert = alertCommands.postDismissAlert;
  getAlertButtons = alertCommands.getAlertButtons;
  mobileHandleAlert = alertCommands.mobileHandleAlert;

  /*---------------+
   | APPMANAGEMENT |
   +---------------+*/

  mobileInstallApp = appManagementCommands.mobileInstallApp;
  mobileIsAppInstalled = appManagementCommands.mobileIsAppInstalled;
  mobileRemoveApp = appManagementCommands.mobileRemoveApp;
  mobileLaunchApp = appManagementCommands.mobileLaunchApp;
  mobileTerminateApp = appManagementCommands.mobileTerminateApp;
  mobileActivateApp = appManagementCommands.mobileActivateApp;
  mobileKillApp = appManagementCommands.mobileKillApp;
  mobileQueryAppState = appManagementCommands.mobileQueryAppState;
  installApp = appManagementCommands.installApp;
  activateApp = appManagementCommands.activateApp;
  isAppInstalled = appManagementCommands.isAppInstalled;
  // @ts-ignore it must return boolean
  terminateApp = appManagementCommands.terminateApp;
  queryAppState = appManagementCommands.queryAppState;
  mobileListApps = appManagementCommands.mobileListApps;
  mobileClearApp = appManagementCommands.mobileClearApp;

  /*------------+
   | APPEARANCE |
   +------------+*/

  mobileSetAppearance = appearanceCommands.mobileSetAppearance;
  mobileGetAppearance = appearanceCommands.mobileGetAppearance;

  /*------------+
   | INCREASE CONTRAST |
   +------------+*/

  mobileSetIncreaseContrast = increaseContrastCommands.mobileSetIncreaseContrast;
  mobileGetIncreaseContrast = increaseContrastCommands.mobileGetIncreaseContrast;

  /*------------+
   | CONTENT SIZE |
   +------------+*/

  mobileSetContentSize = contentSizeCommands.mobileSetContentSize;
  mobileGetContentSize = contentSizeCommands.mobileGetContentSize;

  /*------------+
   | AUDIT      |
   +------------+*/

  mobilePerformAccessibilityAudit = auditCommands.mobilePerformAccessibilityAudit;

  /*---------+
   | BATTERY |
   +---------+*/
  mobileGetBatteryInfo = batteryCommands.mobileGetBatteryInfo;

  /*-----------+
   | BIOMETRIC |
   +-----------+*/

  mobileEnrollBiometric = biometricCommands.mobileEnrollBiometric;
  mobileSendBiometricMatch = biometricCommands.mobileSendBiometricMatch;
  mobileIsBiometricEnrolled = biometricCommands.mobileIsBiometricEnrolled;

  /*-------------+
   | CERTIFICATE |
   +-------------+*/
  mobileInstallCertificate = certificateCommands.mobileInstallCertificate;
  mobileListCertificates = certificateCommands.mobileListCertificates;
  mobileRemoveCertificate = certificateCommands.mobileRemoveCertificate;

  /*-----------+
   | CLIPBOARD |
   +-----------+*/

  setClipboard = clipboardCommands.setClipboard;
  getClipboard = clipboardCommands.getClipboard;

  /*-----------+
   | CONDITION |
   +-----------+*/

  listConditionInducers = conditionCommands.listConditionInducers;
  enableConditionInducer = conditionCommands.enableConditionInducer;
  disableConditionInducer = conditionCommands.disableConditionInducer;

  /*---------+
   | CONTEXT |
   +---------+*/

  getContexts = contextCommands.getContexts;
  getCurrentContext = contextCommands.getCurrentContext;
  // @ts-ignore This is OK
  getWindowHandle = contextCommands.getWindowHandle;
  getWindowHandles = contextCommands.getWindowHandles;
  // @ts-ignore Type mismatch: function type vs method signature
  setContext = contextCommands.setContext;
  // @ts-ignore This is OK
  setWindow = contextCommands.setWindow;
  activateRecentWebview = contextCommands.activateRecentWebview;
  connectToRemoteDebugger = contextCommands.connectToRemoteDebugger;
  getContextsAndViews = contextCommands.getContextsAndViews;
  listWebFrames = contextCommands.listWebFrames;
  mobileGetContexts = contextCommands.mobileGetContexts;
  onPageChange = contextCommands.onPageChange;
  useNewSafari = contextCommands.useNewSafari;
  getCurrentUrl = contextCommands.getCurrentUrl;
  getNewRemoteDebugger = contextCommands.getNewRemoteDebugger;
  getRecentWebviewContextId = contextCommands.getRecentWebviewContextId;
  isWebContext = contextCommands.isWebContext;
  isWebview = contextCommands.isWebview;
  setCurrentUrl = contextCommands.setCurrentUrl;
  stopRemote = contextCommands.stopRemote;

  /*------------+
   | DEVICEINFO |
   +------------+*/

  mobileGetDeviceInfo = deviceInfoCommands.mobileGetDeviceInfo;

  /*---------+
   | ELEMENT |
   +---------+*/

  elementDisplayed = elementCommands.elementDisplayed;
  elementEnabled = elementCommands.elementEnabled;
  elementSelected = elementCommands.elementSelected;
  getName = elementCommands.getName;
  getNativeAttribute = elementCommands.getNativeAttribute;
  getAttribute = elementCommands.getAttribute;
  getProperty = elementCommands.getProperty;
  getText = elementCommands.getText;
  getElementRect = elementCommands.getElementRect;
  getLocation = elementCommands.getLocation;
  getLocationInView = elementCommands.getLocationInView;
  getSize = elementCommands.getSize;
  /** @deprecated */
  setValueImmediate = elementCommands.setValueImmediate;
  setValue = elementCommands.setValue;
  setValueWithWebAtom = elementCommands.setValueWithWebAtom;
  keys = elementCommands.keys;
  clear = elementCommands.clear;
  getContentSize = elementCommands.getContentSize;
  getNativeRect = elementCommands.getNativeRect;

  /*---------+
   | EXECUTE |
   +---------+*/

  receiveAsyncResponse = executeCommands.receiveAsyncResponse;
  execute = executeCommands.execute;
  // @ts-ignore Type mismatch: function type vs method signature
  executeAsync = executeCommands.executeAsync;
  // Note: executeMobile is handled internally via execute method
  mobileSimctl = simctlCommands.mobileSimctl;

  /*--------------+
   | FILEMOVEMENT |
   +--------------+*/

  pushFile = fileMovementCommands.pushFile;
  mobilePushFile = fileMovementCommands.mobilePushFile;
  pullFile = fileMovementCommands.pullFile;
  mobilePullFile = fileMovementCommands.mobilePullFile;
  mobileDeleteFolder = fileMovementCommands.mobileDeleteFolder;
  mobileDeleteFile = fileMovementCommands.mobileDeleteFile;
  pullFolder = fileMovementCommands.pullFolder;
  mobilePullFolder = fileMovementCommands.mobilePullFolder;

  /*--------+
   | MEMORY |
   +--------+*/

  mobileSendMemoryWarning = memoryCommands.mobileSendMemoryWarning;

  /*------+
   | FIND |
   +------+*/

  findElOrEls = findCommands.findElOrEls;
  findNativeElementOrElements = findCommands.findNativeElementOrElements;
  doNativeFind = findCommands.doNativeFind;
  getFirstVisibleChild = findCommands.getFirstVisibleChild;

  /*---------+
   | GENERAL |
   +---------+*/

  active = generalCommands.active;
  background = appManagementCommands.background;
  touchId = generalCommands.touchId;
  toggleEnrollTouchId = generalCommands.toggleEnrollTouchId;
  getWindowSize = generalCommands.getWindowSize;
  getDeviceTime = generalCommands.getDeviceTime;
  mobileGetDeviceTime = generalCommands.mobileGetDeviceTime;
  getWindowRect = generalCommands.getWindowRect;
  getStrings = appStringsCommands.getStrings;
  removeApp = generalCommands.removeApp;
  launchApp = generalCommands.launchApp;
  closeApp = generalCommands.closeApp;
  // @ts-ignore Type mismatch: function type vs method signature
  setUrl = generalCommands.setUrl;
  getViewportRect = generalCommands.getViewportRect;
  getScreenInfo = generalCommands.getScreenInfo;
  getStatusBarHeight = generalCommands.getStatusBarHeight;
  getDevicePixelRatio = generalCommands.getDevicePixelRatio;
  mobilePressButton = generalCommands.mobilePressButton;
  mobileSiriCommand = generalCommands.mobileSiriCommand;

  /*-------------+
   | GEOLOCATION |
   +-------------+*/
  mobileGetSimulatedLocation = geolocationCommands.mobileGetSimulatedLocation;
  mobileSetSimulatedLocation = geolocationCommands.mobileSetSimulatedLocation;
  mobileResetSimulatedLocation = geolocationCommands.mobileResetSimulatedLocation;

  /*---------+
   | GESTURE |
   +---------+*/
  mobileShake = gestureCommands.mobileShake;
  click = gestureCommands.click;
  releaseActions = gestureCommands.releaseActions;
  performActions = gestureCommands.performActions;
  nativeClick = gestureCommands.nativeClick;
  mobileScrollToElement = gestureCommands.mobileScrollToElement;
  mobileScroll = gestureCommands.mobileScroll;
  mobileSwipe = gestureCommands.mobileSwipe;
  mobilePinch = gestureCommands.mobilePinch;
  mobileDoubleTap = gestureCommands.mobileDoubleTap;
  mobileTwoFingerTap = gestureCommands.mobileTwoFingerTap;
  mobileTouchAndHold = gestureCommands.mobileTouchAndHold;
  mobileTap = gestureCommands.mobileTap;
  mobileDragFromToForDuration = gestureCommands.mobileDragFromToForDuration;
  mobileDragFromToWithVelocity = gestureCommands.mobileDragFromToWithVelocity;
  mobileTapWithNumberOfTaps = gestureCommands.mobileTapWithNumberOfTaps;
  mobileForcePress = gestureCommands.mobileForcePress;
  mobileSelectPickerWheelValue = gestureCommands.mobileSelectPickerWheelValue;
  mobileRotateElement = gestureCommands.mobileRotateElement;

  /*-------+
   | IOHID |
   +-------+*/
  mobilePerformIoHidEvent = iohidCommands.mobilePerformIoHidEvent;

  /*-----------+
   | KEYCHAINS |
   +-----------+*/

  mobileClearKeychains = keychainsCommands.mobileClearKeychains;

  /*----------+
   | KEYBOARD |
   +----------+*/

  hideKeyboard = keyboardCommands.hideKeyboard;
  mobileHideKeyboard = keyboardCommands.mobileHideKeyboard;
  isKeyboardShown = keyboardCommands.isKeyboardShown;
  mobileKeys = keyboardCommands.mobileKeys;

  /*--------------+
   | LOCALIZATION |
   +--------------+*/

  mobileConfigureLocalization = localizationCommands.mobileConfigureLocalization;

  /*----------+
   | LOCATION |
   +----------+*/

  getGeoLocation = locationCommands.getGeoLocation;
  setGeoLocation = locationCommands.setGeoLocation;
  mobileResetLocationService = locationCommands.mobileResetLocationService;

  /*------+
   | LOCK |
   +------+*/
  lock = lockCommands.lock;
  unlock = lockCommands.unlock;
  isLocked = lockCommands.isLocked;

  /*-----+
   | LOG |
   +-----+*/

  extractLogs = logCommands.extractLogs;
  supportedLogTypes = logCommands.supportedLogTypes;
  startLogCapture = logCommands.startLogCapture;
  mobileStartLogsBroadcast = logCommands.mobileStartLogsBroadcast;
  mobileStopLogsBroadcast = logCommands.mobileStopLogsBroadcast;

  /*------------+
   | NAVIGATION |
   +------------+*/

  back = navigationCommands.back;
  forward = navigationCommands.forward;
  closeWindow = navigationCommands.closeWindow;
  nativeBack = navigationCommands.nativeBack;
  mobileDeepLink = navigationCommands.mobileDeepLink;

  /*---------------+
   | NOTIFICATIONS |
   +---------------+*/

  mobilePushNotification = notificationsCommands.mobilePushNotification;
  mobileExpectNotification = notificationsCommands.mobileExpectNotification;

  /*------------+
   | PASTEBOARD |
   +------------+*/

  mobileSetPasteboard = pasteboardCommands.mobileSetPasteboard;
  mobileGetPasteboard = pasteboardCommands.mobileGetPasteboard;

  /*------+
   | PCAP |
   +------+*/

  mobileStartPcap = pcapCommands.mobileStartPcap;
  mobileStopPcap = pcapCommands.mobileStopPcap;

  /*-------------+
   | PERFORMANCE |
   +-------------+*/
  mobileStartPerfRecord = performanceCommands.mobileStartPerfRecord;
  mobileStopPerfRecord = performanceCommands.mobileStopPerfRecord;

  /*-------------+
   | PERMISSIONS |
   +-------------+*/

  mobileResetPermission = permissionsCommands.mobileResetPermission;
  mobileGetPermission = permissionsCommands.mobileGetPermission;
  mobileSetPermissions = permissionsCommands.mobileSetPermissions;

  /*-------------+
   | PROXYHELPER |
   +-------------+*/

  proxyCommand = proxyHelperCommands.proxyCommand;

  /*-------------+
   | RECORDAUDIO |
   +-------------+*/

  startAudioRecording = recordAudioCommands.startAudioRecording;
  stopAudioRecording = recordAudioCommands.stopAudioRecording;

  /*--------------+
   | RECORDSCREEN |
   +--------------+*/

  // Note: _recentScreenRecorder is a property, not a function, so it's handled internally in recordscreen.js
  startRecordingScreen = recordScreenCommands.startRecordingScreen;
  stopRecordingScreen = recordScreenCommands.stopRecordingScreen;

  /*-------------+
   | SCREENSHOTS |
   +-------------+*/
  getScreenshot = screenshotCommands.getScreenshot;
  getElementScreenshot = screenshotCommands.getElementScreenshot;
  getViewportScreenshot = screenshotCommands.getViewportScreenshot;

  /*--------+
   | SOURCE |
   +--------+*/
  getPageSource = sourceCommands.getPageSource;
  mobileGetSource = sourceCommands.mobileGetSource;

  /*----------+
   | TIMEOUTS |
   +----------+*/

  pageLoadTimeoutW3C = timeoutCommands.pageLoadTimeoutW3C;
  pageLoadTimeoutMJSONWP = timeoutCommands.pageLoadTimeoutMJSONWP;
  scriptTimeoutW3C = timeoutCommands.scriptTimeoutW3C;
  scriptTimeoutMJSONWP = timeoutCommands.scriptTimeoutMJSONWP;
  asyncScriptTimeout = timeoutCommands.asyncScriptTimeout;
  setPageLoadTimeout = timeoutCommands.setPageLoadTimeout;
  setAsyncScriptTimeout = timeoutCommands.setAsyncScriptTimeout;

  /*-----+
   | WEB |
   +-----+*/
  // @ts-ignore Type mismatch: function type vs method signature
  setFrame = webCommands.setFrame;
  getCssProperty = webCommands.getCssProperty;
  submit = webCommands.submit;
  refresh = webCommands.refresh;
  getUrl = webCommands.getUrl;
  title = webCommands.title;
  getCookies = webCommands.getCookies;
  setCookie = webCommands.setCookie;
  deleteCookie = webCommands.deleteCookie;
  deleteCookies = webCommands.deleteCookies;
  cacheWebElement = webCommands.cacheWebElement;
  cacheWebElements = webCommands.cacheWebElements;
  executeAtom = webCommands.executeAtom;
  executeAtomAsync = webCommands.executeAtomAsync;
  getAtomsElement = webCommands.getAtomsElement;
  convertElementsForAtoms = webCommands.convertElementsForAtoms;
  getElementId = webCommands.getElementId;
  hasElementId = webCommands.hasElementId;
  findWebElementOrElements = webCommands.findWebElementOrElements;
  clickWebCoords = webCommands.clickWebCoords;
  getSafariIsIphone = webCommands.getSafariIsIphone;
  getSafariDeviceSize = webCommands.getSafariDeviceSize;
  getSafariIsNotched = webCommands.getSafariIsNotched;
  getExtraTranslateWebCoordsOffset = webCommands.getExtraTranslateWebCoordsOffset;
  getExtraNativeWebTapOffset = webCommands.getExtraNativeWebTapOffset;
  nativeWebTap = webCommands.nativeWebTap;
  translateWebCoords = webCommands.translateWebCoords;
  checkForAlert = webCommands.checkForAlert;
  waitForAtom = webCommands.waitForAtom;
  mobileWebNav = webCommands.mobileWebNav;
  getWdaLocalhostRoot = webCommands.getWdaLocalhostRoot;
  mobileCalibrateWebToRealCoordinatesTranslation = webCommands.mobileCalibrateWebToRealCoordinatesTranslation;
  mobileUpdateSafariPreferences = webCommands.mobileUpdateSafariPreferences;

  /*--------+
   | XCTEST |
   +--------+*/
  mobileRunXCTest = xctestCommands.mobileRunXCTest;
  mobileInstallXCTestBundle = xctestCommands.mobileInstallXCTestBundle;
  mobileListXCTestBundles = xctestCommands.mobileListXCTestBundles;
  mobileListXCTestsInTestBundle = xctestCommands.mobileListXCTestsInTestBundle;

  /*----------------------+
   | XCTEST SCREEN RECORD |
   +---------------------+*/
  mobileStartXctestScreenRecording = xctestRecordScreenCommands.mobileStartXctestScreenRecording;
  mobileGetXctestScreenRecordingInfo = xctestRecordScreenCommands.mobileGetXctestScreenRecordingInfo;
  mobileStopXctestScreenRecording = xctestRecordScreenCommands.mobileStopXctestScreenRecording;
}

export default XCUITestDriver;

export type AutInstallationStateOptions = Pick<XCUITestDriverOpts, 'enforceAppInstall' | 'fullReset' | 'noReset' | 'bundleId' | 'app'>;

export interface AutInstallationState {
  install: boolean; // If the given app should install, or not need to install.
  skipUninstall: boolean; // If the installed app should be uninstalled, or not.
}

export type XCUITestDriverOpts = DriverOpts<XCUITestDriverConstraints>;
export type W3CXCUITestDriverCaps = W3CDriverCaps<XCUITestDriverConstraints>;

export interface DriverLogs {
  syslog?: IOSDeviceLog | IOSSimulatorLog;
  crashlog?: IOSCrashLog;
  safariConsole?: SafariConsoleLog;
  safariNetwork?: SafariNetworkLog;
  performance?: IOSPerformanceLog;
}
