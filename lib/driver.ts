import {WebDriverAgent, type WebDriverAgentArgs} from 'appium-webdriveragent';
import {BaseDriver, DeviceSettings} from 'appium/driver';
import {mjpeg, util} from 'appium/support';
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
import {LRUCache} from 'lru-cache';
import EventEmitter from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {onDownloadApp, onPostConfigureApp, verifyApplicationPlatform} from './commands/app-install';
import {SUPPORTED_EXTENSIONS} from './commands/constants';
import {
  DEFAULT_TIMEOUT_KEY,
  SAFARI_BUNDLE_ID,
  checkAppPresent,
  getAndCheckXcodeVersion,
  getDriverInfo,
  normalizeCommandTimeouts,
  printUser,
  removeAllSessionWebSocketHandlers,
  shouldSetInitialSafariUrl,
} from './commands/helpers';
import {isEmpty, isPlainObject, memoize, normalizePlatformVersion} from './utils';
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
import * as deviceInfoCommands from './commands/device-info';
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
import * as networkMonitorCommands from './commands/network-monitor';
import * as performanceCommands from './commands/performance';
import * as permissionsCommands from './commands/permissions';
import * as proxyHelperCommands from './commands/proxy-helper';
import * as recordAudioCommands from './commands/record-audio';
import * as recordScreenCommands from './commands/recordscreen';
import * as screenshotCommands from './commands/screenshots';
import * as simulatorCommands from './commands/simulator';
import * as sourceCommands from './commands/source';
import * as simctlCommands from './commands/simctl';
import * as timeoutCommands from './commands/timeouts';
import * as voiceOverCommands from './commands/voiceover';
import * as webCommands from './commands/web';
import {start, startWdaSession} from './commands/wda/startup';
import {stop} from './commands/wda/stop';
import {getDerivedDataPath} from './commands/wda/utils';
import * as xctestCommands from './commands/xctest';
import * as xctestRecordScreenCommands from './commands/xctest-record-screen';
import * as increaseContrastCommands from './commands/increase-contrast';
import {desiredCapConstraints, type XCUITestDriverConstraints} from './desired-caps';
import {DeviceConnectionsFactory} from './device/device-connections-factory';
import {DeviceDiscovery, type DeviceDiscoveryResult} from './device/device-discovery';
import {RemoteXPCFacade} from './device/remote-xpc';
import {
  assertWdaHostPlatformSupported,
  assertWdaHostSessionCapsSupported,
  createWdaHostOps,
} from './device/wda-host-ops';
import {executeMethodMap} from './execute-method-map';
import {newMethodMap} from './method-map';
import {
  installToRealDevice,
  runRealDeviceReset,
  applySafariStartupArgs,
  detectUdid,
  type RealDevice,
} from './device/real-device-management';
import {
  createSim as createSimulator,
  getExistingSim as getExistingSimulator,
  installToSimulator,
  runSimulatorReset,
  shutdownSimulator,
} from './device/simulator-management';
import {isXcodebuildNeeded as isWdaXcodebuildNeeded} from './commands/wda/constants';
import {AppInfosCache} from './app-infos-cache';
import {notifyBiDiContextChange} from './commands/context';
import type {CalibrationData, IConditionInducer, LifecycleData} from './types';
import type {WaitingAtoms, LogListener, FullContext} from './commands/types';
import type {PerfRecorder} from './commands/performance';
import type {AudioRecorder} from './commands/record-audio';
import type {NetworkMonitorSession} from './device/network-monitor-session';
import type {ScreenRecorder} from './commands/recordscreen';
import type {RemoteDebugger} from 'appium-remote-debugger';
import type {XcodeVersion} from 'appium-xcode';
import type {Simulator} from 'appium-ios-simulator';
import type {DriverLogs} from './commands/log';
import {sessionClaimHandler} from './session-claim-handler';

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
  pageSourceExcludedAttributes: '',
};
// This lock assures, that each driver session does not
// affect shared resources of the other parallel sessions
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

export type AutInstallationStateOptions = Pick<
  XCUITestDriverOpts,
  'enforceAppInstall' | 'fullReset' | 'noReset' | 'bundleId' | 'app'
>;

export interface AutInstallationState {
  install: boolean; // If the given app should install, or not need to install.
  skipUninstall: boolean; // If the installed app should be uninstalled, or not.
}

export type XCUITestDriverOpts = DriverOpts<XCUITestDriverConstraints>;

export type W3CXCUITestDriverCaps = W3CDriverCaps<XCUITestDriverConstraints>;

export class XCUITestDriver
  extends BaseDriver<XCUITestDriverConstraints, StringRecord>
  implements ExternalDriver<XCUITestDriverConstraints, FullContext | string, StringRecord>
{
  static newMethodMap = newMethodMap;

  static executeMethodMap = executeMethodMap;

  curWindowHandle: string | null | undefined;
  selectingNewPage: boolean | undefined;
  contexts: string[];
  curContext: string | null;
  curWebFrames: string[];

  webviewCalibrationResult: CalibrationData | null;
  asyncWaitMs: number | undefined;
  _syslogWebsocketListener: ((logRecord: {message: string}) => void) | null;
  _perfRecorders: PerfRecorder[];
  webElementsCache: LRUCache<any, any>;

  _conditionInducer: IConditionInducer | null; // Condition inducer facade that abstracts implementation details
  _isSafariIphone: boolean | undefined;
  _isSafariNotched: boolean | undefined;
  _waitingAtoms: WaitingAtoms;
  lifecycleData: LifecycleData;

  _audioRecorder: AudioRecorder | null;
  xcodeVersion: XcodeVersion | undefined;
  _networkMonitorSession: NetworkMonitorSession | null;
  _remoteXPCFacade: RemoteXPCFacade | null;
  _recentScreenRecorder: ScreenRecorder | null;
  _device: Simulator | RealDevice;
  _iosSdkVersion: string | null;
  _wda: WebDriverAgent | null;
  _remote: RemoteDebugger | null;
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

  readonly deviceConnectionsFactory: DeviceConnectionsFactory;

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
  getWindowHandle = contextCommands.getWindowHandle;
  getWindowHandles = contextCommands.getWindowHandles;
  setContext = contextCommands.setContext;
  setWindow = contextCommands.setWindow;
  activateRecentWebview = contextCommands.activateRecentWebview;
  connectToRemoteDebugger = contextCommands.connectToRemoteDebugger;
  getContextsAndViews = contextCommands.getContextsAndViews;
  listWebFrames = contextCommands.listWebFrames;
  mobileGetContexts = contextCommands.mobileGetContexts;
  onPageChange = contextCommands.onPageChange;
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

  execute = executeCommands.execute;
  executeAsync = executeCommands.executeAsync;
  // Note: executeMobile is handled internally via execute method
  mobileSimctl = simctlCommands.mobileSimctl;

  /*-----------+
   | SIMULATOR |
   +-----------+*/

  initSimulator = simulatorCommands.initSimulator;
  startSim = simulatorCommands.startSim;
  createSim = simulatorCommands.createSim;

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

  /*-----------+
   | VOICEOVER |
   +-----------+*/
  mobileEnableVoiceOver = voiceOverCommands.mobileEnableVoiceOver;
  mobileDisableVoiceOver = voiceOverCommands.mobileDisableVoiceOver;
  mobileIsVoiceOverEnabled = voiceOverCommands.mobileIsVoiceOverEnabled;
  mobileVoiceOverMove = voiceOverCommands.mobileVoiceOverMove;
  mobileVoiceOverCurrentSpeech = voiceOverCommands.mobileVoiceOverCurrentSpeech;

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
  mobilePerformIndigoHidEvent = iohidCommands.mobilePerformIndigoHidEvent;

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

  /*------------------+
   | NETWORK MONITOR |
   +------------------+*/

  mobileStartNetworkMonitor = networkMonitorCommands.mobileStartNetworkMonitor;
  mobileStopNetworkMonitor = networkMonitorCommands.mobileStopNetworkMonitor;

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
  mobileStartScreenRecording = recordScreenCommands.mobileStartScreenRecording;
  mobileStopScreenRecording = recordScreenCommands.mobileStopScreenRecording;

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
  mobileCalibrateWebToRealCoordinatesTranslation =
    webCommands.mobileCalibrateWebToRealCoordinatesTranslation;
  mobileUpdateSafariPreferences = webCommands.mobileUpdateSafariPreferences;

  /*--------+
   | WDA    |
   +--------*/
  startWda = start;
  /**
   * @deprecated This method should be made protected/private.
   */
  startWdaSession = startWdaSession;
  stopWda = stop;

  /*--------+
   | XCTEST |
   +--------+*/
  mobileRunXCTest = xctestCommands.mobileRunXCTest;
  mobileInstallXCTestBundle = xctestCommands.mobileInstallXCTestBundle;
  mobileListXCTestBundles = xctestCommands.mobileListXCTestBundles;

  /*----------------------+
   | XCTEST SCREEN RECORD |
   +---------------------+*/
  mobileStartXctestScreenRecording = xctestRecordScreenCommands.mobileStartXctestScreenRecording;
  mobileGetXctestScreenRecordingInfo =
    xctestRecordScreenCommands.mobileGetXctestScreenRecordingInfo;
  mobileStopXctestScreenRecording = xctestRecordScreenCommands.mobileStopXctestScreenRecording;
  constructor(opts: XCUITestDriverOpts, shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);

    this.deviceConnectionsFactory = new DeviceConnectionsFactory(this.log);

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
      alertMonitor: undefined,
      alertMonitorAbortController: undefined,
    };
    this.resetIos();
    this.settings = new DeviceSettings(DEFAULT_SETTINGS, this.onSettingsUpdate.bind(this));
    this.logs = {} as DriverLogs;
    this._networkMonitorSession = null;
    this._remoteXPCFacade = null;
    // memoize functions here, so that they are done on a per-instance basis
    for (const fn of MEMOIZED_FUNCTIONS) {
      this[fn] = memoize(this[fn]);
    }
    this.lifecycleData = {};
    this._audioRecorder = null;
    this.appInfosCache = new AppInfosCache(this.log);
    this._remote = null;
    this.doesSupportBidi = true;
    this._wda = null;
  }

  // Getter methods
  get wda(): WebDriverAgent {
    if (!this._wda) {
      throw new Error('WebDriverAgent is not initialized');
    }
    return this._wda;
  }

  get remote(): RemoteDebugger {
    if (!this._remote) {
      throw new Error('Remote debugger is not initialized');
    }
    return this._remote;
  }

  override get driverData(): Record<string, any> {
    return {};
  }

  get device(): Simulator | RealDevice {
    return this._device;
  }

  /**
   * Lazy per-session RemoteXPC facade (tunnel probe + cached fallback state).
   *
   * @throws {Error} If this.opts.udid is not set.
   */
  get remoteXPCFacade(): RemoteXPCFacade {
    return this.getOrCreateRemoteXPCFacade(this.isRealDevice());
  }

  async onIpcInit(): Promise<void> {
    await sessionClaimHandler.registerActiveSession(this);
  }

  // Override methods from BaseDriver
  override async createSession(
    w3cCaps1: W3CXCUITestDriverCaps,
    w3cCaps2?: W3CXCUITestDriverCaps,
    w3cCaps3?: W3CXCUITestDriverCaps,
    driverData?: DriverData[],
  ): Promise<DefaultCreateSessionResult<XCUITestDriverConstraints>> {
    try {
      const [sessionId, initialCaps] = await super.createSession(
        w3cCaps1,
        w3cCaps2,
        w3cCaps3,
        driverData,
      );
      let caps = initialCaps;

      // merge cli args to opts, and if we did merge any, revalidate opts to ensure the final set
      // is also consistent
      if (this.mergeCliArgsToOpts()) {
        this.validateDesiredCaps({...caps, ...this.cliArgs});
      }

      await this.start();

      // merge server capabilities + desired capabilities
      caps = {...defaultServerCaps, ...caps};
      // update the udid with what is actually used
      caps.udid = this.opts.udid;
      // ensure we track nativeWebTap capability as a setting as well
      if (Object.hasOwn(this.opts, 'nativeWebTap')) {
        await this.updateSettings({nativeWebTap: this.opts.nativeWebTap});
      }
      // ensure we track nativeWebTapStrict capability as a setting as well
      if (Object.hasOwn(this.opts, 'nativeWebTapStrict')) {
        await this.updateSettings({nativeWebTapStrict: this.opts.nativeWebTapStrict});
      }
      // ensure we track useJSONSource capability as a setting as well
      if (Object.hasOwn(this.opts, 'useJSONSource')) {
        await this.updateSettings({useJSONSource: this.opts.useJSONSource});
      }

      const wdaSettings: StringRecord = {
        elementResponseAttributes: DEFAULT_SETTINGS.elementResponseAttributes,
        shouldUseCompactResponses: DEFAULT_SETTINGS.shouldUseCompactResponses,
      };
      if (
        'elementResponseAttributes' in this.opts &&
        typeof this.opts.elementResponseAttributes === 'string'
      ) {
        wdaSettings.elementResponseAttributes = this.opts.elementResponseAttributes;
      }
      if (
        'shouldUseCompactResponses' in this.opts &&
        typeof this.opts.shouldUseCompactResponses === 'boolean'
      ) {
        wdaSettings.shouldUseCompactResponses = this.opts.shouldUseCompactResponses;
      }
      if (
        'mjpegServerScreenshotQuality' in this.opts &&
        typeof this.opts.mjpegServerScreenshotQuality === 'number'
      ) {
        wdaSettings.mjpegServerScreenshotQuality = this.opts.mjpegServerScreenshotQuality;
      }
      if (
        'mjpegServerFramerate' in this.opts &&
        typeof this.opts.mjpegServerFramerate === 'number'
      ) {
        wdaSettings.mjpegServerFramerate = this.opts.mjpegServerFramerate;
      }
      if (Object.hasOwn(this.opts, 'screenshotQuality')) {
        this.log.info(`Setting the quality of phone screenshot: '${this.opts.screenshotQuality}'`);
        wdaSettings.screenshotQuality = this.opts.screenshotQuality;
      }
      // ensure WDA gets our defaults instead of whatever its own might be
      await this.updateSettings(wdaSettings);

      await this.handleMjpegOptions();

      return [sessionId, caps];
    } catch (e) {
      this.log.error(JSON.stringify(e));
      await this.deleteSession();
      throw e;
    }
  }

  override async deleteSession(sessionId?: string): Promise<void> {
    sessionClaimHandler.unregisterActiveSession(this);

    await removeAllSessionWebSocketHandlers.bind(this)();

    for (const recorder of [this._recentScreenRecorder, this._audioRecorder].filter(
      (r): r is NonNullable<typeof r> => Boolean(r),
    )) {
      await recorder.interrupt(true);
      await recorder.cleanup();
    }
    await this._networkMonitorSession?.interrupt();
    this._networkMonitorSession = null;

    if (!isEmpty(this._perfRecorders)) {
      await Promise.all(this._perfRecorders.map((x) => x.stop(true)));
      this._perfRecorders = [];
    }

    if (this._conditionInducer) {
      try {
        await this.disableConditionInducer();
      } catch (err) {
        this.log.warn(`Cannot disable condition inducer: ${err.message}`);
      }
    }

    await this.stop();

    if (this._remote) {
      this.log.debug('Found a remote debugger session. Removing...');
      await this.stopRemote();
    }

    if (this.opts.resetOnSessionStartOnly === false) {
      await this.runReset(true);
    }

    const simulatorDevice = this.isSimulator() ? (this.device as Simulator) : null;
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

    await Promise.all(
      Object.values(this.logs).map(async (logObj) => {
        try {
          await logObj?.stopCapture();
        } catch {}
        logObj?.removeAllListeners();
      }),
    );
    if (this._bidiServerLogListener) {
      this.log.unwrap().off('log', this._bidiServerLogListener);
    }
    this.logs = {} as DriverLogs;

    if (this.mjpegStream) {
      this.log.info('Closing MJPEG stream');
      this.mjpegStream.stop();
    }

    this.resetIos();

    this._remoteXPCFacade = null;

    await super.deleteSession(sessionId);
  }

  override async executeCommand(cmd: string, ...args: any[]): Promise<any> {
    this.log.debug(`Executing command '${cmd}'`);

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
    if (String(caps.browserName).toLowerCase() !== 'safari' && !caps.app && !caps.bundleId) {
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
      if (args != null && !Array.isArray(args)) {
        throw this.log.errorWithException('processArguments.args must be an array of strings');
      }
      if (env != null && !isPlainObject(env)) {
        throw this.log.errorWithException(
          'processArguments.env must be an object <key,value> pair {a:b, c:d}',
        );
      }
    };

    // `processArguments` should be JSON string or an object with arguments and/ environment details
    if (caps.processArguments) {
      if (typeof caps.processArguments === 'string') {
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
      } else if (isPlainObject(caps.processArguments)) {
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
      caps.commandTimeouts = normalizeCommandTimeouts(
        caps.commandTimeouts as string | Record<string, number>,
      );
    }

    if (typeof caps.webDriverAgentUrl === 'string') {
      try {
        new URL(caps.webDriverAgentUrl);
      } catch {
        throw this.log.errorWithException(
          `'webDriverAgentUrl' capability is expected to contain a valid WebDriverAgent server URL. ` +
            `'${caps.webDriverAgentUrl}' is given instead`,
        );
      }
    }

    if (caps.browserName) {
      if (caps.bundleId) {
        throw this.log.errorWithException(
          `'browserName' cannot be set together with 'bundleId' capability`,
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
        for (const [bundleId, perms] of Object.entries(JSON.parse(caps.permissions))) {
          if (typeof bundleId !== 'string') {
            throw new Error(`'${JSON.stringify(bundleId)}' must be a string`);
          }
          if (!isPlainObject(perms)) {
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

    // ignoredWebviewBundleIds is an array, JSON array, or string
    if (caps.ignoredWebviewBundleIds) {
      caps.ignoredWebviewBundleIds = this.helpers.parseCapsArray(
        caps.ignoredWebviewBundleIds as string | string[],
      );
    }

    // finally, return true since the superclass check passed, as did this
    return true;
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
    return isWdaXcodebuildNeeded(this.opts);
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
    const status: Record<string, any> = {
      ready: true,
      message: 'The driver is ready to accept new connections',
      build: await getDriverInfo(),
    };
    if (this.cachedWdaStatus) {
      status.wda = this.cachedWdaStatus;
    }
    return status;
  }

  mergeCliArgsToOpts(): boolean {
    let didMerge = false;
    // this.cliArgs should never include anything we do not expect.
    for (const [key, value] of Object.entries(this.cliArgs ?? {})) {
      if (Object.hasOwn(this.opts, key)) {
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
    const mjpegServerPort = Number(this.opts.mjpegServerPort || DEFAULT_MJPEG_SERVER_PORT);
    this.log.debug(
      `Forwarding MJPEG server port ${mjpegServerPort} to local port ${mjpegServerPort}`,
    );
    try {
      await this.deviceConnectionsFactory.requestConnection(this.opts.udid, mjpegServerPort, {
        devicePort: mjpegServerPort,
        usePortForwarding: this.isRealDevice(),
        remoteXPCFacade: this.isRealDevice() ? this.remoteXPCFacade : null,
      });
    } catch (error) {
      if (this.opts.mjpegServerPort === undefined) {
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
          {cause: error},
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
    assertWdaHostSessionCapsSupported(this.opts);
    const {device, udid, realDevice} = await this.determineDevice();
    this.log.info(
      `Determining device to run tests on: udid: '${udid}', real device: ${realDevice}`,
    );
    this._device = device;
    this.opts.udid = udid;

    await sessionClaimHandler.registerActiveSession(this);
    await sessionClaimHandler.claimSessionUdid(this);

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

    if (!this.opts.platformVersion) {
      throw new Error('Could not determine platformVersion for the selected device');
    }
    const normalizedVersion = normalizePlatformVersion(this.opts.platformVersion);
    if (this.opts.platformVersion !== normalizedVersion) {
      this.log.info(
        `Normalized platformVersion capability value '${this.opts.platformVersion}' to '${normalizedVersion}'`,
      );
      this.opts.platformVersion = normalizedVersion;
    }
    this.caps.platformVersion = this.opts.platformVersion;

    if (realDevice) {
      (device as RealDevice).attachRemoteXPCFacade(this.getOrCreateRemoteXPCFacade(true));
    }

    assertWdaHostPlatformSupported(this);

    if (isEmpty(this.xcodeVersion) && (this.isXcodebuildNeeded() || this.isSimulator())) {
      // no `webDriverAgentUrl`, or on a simulator, so we need an Xcode version
      this.xcodeVersion = await getAndCheckXcodeVersion();
    }
    this.logEvent('xcodeDetailsRetrieved');

    if (String(this.opts.browserName).toLowerCase() === 'safari') {
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
      {
        ...this.opts,
        device: this.device,
        realDevice: this.isRealDevice(),
        iosSdkVersion: this._iosSdkVersion ?? undefined,
        reqBasePath: this.basePath,
        hostOps: createWdaHostOps(this),
      } as WebDriverAgentArgs,
      this.log,
    );
    // Derived data path retrieval is an expensive operation
    // We could start that now in background and get the cached result
    // whenever it is needed
    void (async () => {
      try {
        await getDerivedDataPath(this.wda);
      } catch (e) {
        this.log.debug(e);
      }
    })();

    const memoizedLogInfo = memoize(() => {
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
      await certificateCommands.installCustomSslCertFromCapability.bind(this)();
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
      throw this.log.errorWithException(
        `App with bundle identifier '${this.opts.bundleId}' unknown`,
      );
    }

    if (this.isSimulator()) {
      if (this.opts.permissions) {
        this.log.debug('Setting the requested permissions before WDA is started');
        for (const [bundleId, permissionsMapping] of Object.entries(
          JSON.parse(this.opts.permissions as string),
        )) {
          await (this.device as Simulator).setPermissions(
            bundleId,
            permissionsMapping as StringRecord,
          );
        }
      }
    }

    await this.startWda();

    if (typeof this.opts.orientation === 'string') {
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
        if (this.opts.safariInitialUrl == null && this.opts.initialDeeplinkUrl == null) {
          this.log.info(`Use the 'safariInitialUrl' capability to customize it`);
        }
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

    await this.stopWda();
    await this.deviceConnectionsFactory.releaseConnection(this.opts.udid);
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
    switch (String(this.opts.app).toLowerCase()) {
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

  async determineDevice(): Promise<DeviceDiscoveryResult> {
    const result = await new DeviceDiscovery({
      driverOpts: this.opts,
      log: this.log,
      detectUdid: async () => await detectUdid.bind(this)(),
      getExistingSimulator: async (opts) => await getExistingSimulator.call(this, opts),
      createSimulator: async (opts) => {
        const sim = await createSimulator.call(this, opts);
        this.log.info(`Created simulator with udid '${sim.udid}'.`);
        return sim;
      },
    }).determine();

    this.lifecycleData.createSim = result.createdSimulator;
    this._iosSdkVersion = result.iosSdkVersion;
    this.opts.platformVersion = result.platformVersion;
    return result;
  }

  async checkAutInstallationState(
    opts?: AutInstallationStateOptions,
  ): Promise<AutInstallationState> {
    const {enforceAppInstall, fullReset, noReset, bundleId, app} = opts ?? this.opts;

    const wasAppInstalled = !!bundleId && (await this.device.isAppInstalled(bundleId));
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
      this.log.info(
        `App '${bundleId}' is not installed yet or it has an offload and ` +
          'cannot be detected, which might keep the local data.',
      );
    }
    if (enforceAppInstall !== false || fullReset || !wasAppInstalled) {
      return {
        install: true,
        skipUninstall: !wasAppInstalled,
      };
    }

    const candidateBundleVersion = app
      ? await this.appInfosCache.extractBundleVersion(app)
      : undefined;
    this.log.debug(`CFBundleVersion from Info.plist: ${candidateBundleVersion}`);
    if (!candidateBundleVersion) {
      return {
        install: true,
        skipUninstall: false,
      };
    }

    const appBundleVersion = (
      this.isRealDevice()
        ? await (this.device as RealDevice).fetchAppInfo(bundleId)
        : await (this.device as Simulator).simctl.appInfo(bundleId)
    )?.CFBundleVersion;
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
        await delay(pauseMs);
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

    const appPaths: string[] = await Promise.all(
      appsList.map((app) =>
        this.helpers.configureApp(app, {
          onPostProcess: onPostConfigureApp.bind(this),
          onDownload: onDownloadApp.bind(this),
          supportedExtensions: SUPPORTED_EXTENSIONS,
        }),
      ),
    );
    const appIds: string[] = await Promise.all(
      appPaths.map((appPath) => this.appInfosCache.extractBundleId(appPath)),
    );
    for (const [appId, appPath] of appIds.map((v, i) => [v, appPaths[i]] as const)) {
      if (this.isRealDevice()) {
        await installToRealDevice.bind(this)(appPath, appId, {
          skipUninstall: true, // to make the behavior as same as UIA2
          timeout: this.opts.appPushTimeout,
        });
      } else {
        await installToSimulator.bind(this)(appPath, appId, {
          newSimulator: this.lifecycleData.createSim,
        });
      }
    }
  }

  async setInitialOrientation(orientation: string): Promise<void> {
    const dstOrientation = String(orientation).toUpperCase();
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
    this._remote = null;
    this._conditionInducer = null;

    this.webElementsCache = new LRUCache({
      max: WEB_ELEMENTS_CACHE_SIZE,
    });

    this._waitingAtoms = {
      count: 0,
      alertNotifier: new EventEmitter(),
      alertMonitor: undefined,
      alertMonitorAbortController: undefined,
    };
  }

  _getCommandTimeout(cmdName?: string): number | undefined {
    if (this.opts.commandTimeouts) {
      if (cmdName && Object.hasOwn(this.opts.commandTimeouts, cmdName)) {
        return this.opts.commandTimeouts[cmdName];
      }
      return this.opts.commandTimeouts[DEFAULT_TIMEOUT_KEY];
    }
  }

  private getOrCreateRemoteXPCFacade(isRealDevice: boolean): RemoteXPCFacade {
    const udid = this.opts.udid;
    if (!udid) {
      throw new Error('Cannot access RemoteXPC session state before device UDID is set');
    }
    if (!this._remoteXPCFacade || this._remoteXPCFacade.udid !== udid) {
      this._remoteXPCFacade = new RemoteXPCFacade(
        udid,
        this.opts.platformVersion,
        this.log,
        isRealDevice,
      );
    }
    return this._remoteXPCFacade;
  }
}

export default XCUITestDriver;
