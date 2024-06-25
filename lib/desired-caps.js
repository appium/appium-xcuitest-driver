// These platform names should be valid in simulator name
const PLATFORM_NAME_IOS = 'iOS';
const PLATFORM_NAME_TVOS = 'tvOS';

const desiredCapConstraints = /** @type {const} */ ({
  platformName: {
    // override
    presence: true,
    isString: true,
    inclusionCaseInsensitive: [PLATFORM_NAME_IOS, PLATFORM_NAME_TVOS],
  },
  browserName: {
    isString: true,
  },
  app: {
    isString: true,
  },
  calendarFormat: {
    isString: true,
  },
  bundleId: {
    isString: true,
  },
  udid: {
    isString: true,
  },
  autoAcceptAlerts: {
    isBoolean: true,
  },
  autoDismissAlerts: {
    isBoolean: true,
  },
  nativeWebTap: {
    isBoolean: true,
  },
  safariInitialUrl: {
    isString: true,
  },
  initialDeeplinkUrl: {
    isString: true,
  },
  safariAllowPopups: {
    isBoolean: true,
  },
  safariIgnoreFraudWarning: {
    isBoolean: true,
  },
  safariOpenLinksInBackground: {
    isBoolean: true,
  },
  safariShowFullResponse: {
    isBoolean: true,
  },
  keepKeyChains: {
    isBoolean: true,
  },
  resetLocationService: {
    isBoolean: true,
  },
  localizableStringsDir: {
    isString: true,
  },
  processArguments: {
    // recognize the cap,
    // but validate in the driver#validateDesiredCaps method
  },
  showIOSLog: {
    isBoolean: true,
  },
  webviewConnectRetries: {
    isNumber: true,
  },
  clearSystemFiles: {
    isBoolean: true,
  },
  customSSLCert: {
    isString: true,
  },
  webkitResponseTimeout: {
    isNumber: true,
  },
  remoteDebugProxy: {
    isString: true,
  },
  enablePerformanceLogging: {
    isBoolean: true,
  },
  enableAsyncExecuteFromHttps: {
    isBoolean: true,
  },
  fullContextList: {
    isBoolean: true,
  },
  ignoreAboutBlankUrl: {
    isBoolean: true,
  },
  skipLogCapture: {
    isBoolean: true,
  },
  deviceName: {
    isString: true,
  },
  showXcodeLog: {
    isBoolean: true,
  },
  wdaLocalPort: {
    isNumber: true,
  },
  wdaRemotePort: {
    isNumber: true,
  },
  wdaBaseUrl: {
    isString: true,
  },
  iosInstallPause: {
    isNumber: true,
  },
  xcodeConfigFile: {
    isString: true,
  },
  xcodeOrgId: {
    isString: true,
  },
  xcodeSigningId: {
    isString: true,
  },
  keychainPath: {
    isString: true,
  },
  keychainPassword: {
    isString: true,
  },
  bootstrapPath: {
    isString: true,
  },
  agentPath: {
    isString: true,
  },
  scaleFactor: {
    isString: true,
  },
  usePrebuiltWDA: {
    isBoolean: true,
  },
  prebuiltWDAPath: {
    isString: true,
  },
  usePreinstalledWDA: {
    isBoolean: true,
  },
  updatedWDABundleIdSuffix: {
    isString: true,
  },
  webDriverAgentUrl: {
    isString: true,
  },
  derivedDataPath: {
    isString: true,
  },
  launchWithIDB: {
    isBoolean: true,
  },
  useNewWDA: {
    isBoolean: true,
  },
  wdaLaunchTimeout: {
    isNumber: true,
  },
  wdaConnectionTimeout: {
    isNumber: true,
  },
  updatedWDABundleId: {
    isString: true,
  },
  resetOnSessionStartOnly: {
    isBoolean: true,
  },
  commandTimeouts: {
    // recognize the cap,
    // but validate in the driver#validateDesiredCaps method
  },
  wdaStartupRetries: {
    isNumber: true,
  },
  wdaStartupRetryInterval: {
    isNumber: true,
  },
  prebuildWDA: {
    isBoolean: true,
  },
  connectHardwareKeyboard: {
    isBoolean: true,
  },
  forceTurnOnSoftwareKeyboardSimulator: {
    isBoolean: true,
  },
  simulatorPasteboardAutomaticSync: {
    isString: true,
  },
  simulatorDevicesSetPath: {
    isString: true,
  },
  calendarAccessAuthorized: {
    isBoolean: true,
    deprecated: true
  },
  useSimpleBuildTest: {
    isBoolean: true,
    deprecated: true
  },
  waitForQuiescence: {
    isBoolean: true,
    deprecated: true
  },
  maxTypingFrequency: {
    isNumber: true,
  },
  nativeTyping: {
    isBoolean: true,
  },
  simpleIsVisibleCheck: {
    isBoolean: true,
  },
  shouldUseSingletonTestManager: {
    isBoolean: true,
  },
  isHeadless: {
    isBoolean: true,
  },
  useXctestrunFile: {
    isBoolean: true,
  },
  absoluteWebLocations: {
    isBoolean: true,
  },
  simulatorWindowCenter: {
    isString: true,
  },
  simulatorStartupTimeout: {
    isNumber: true,
  },
  simulatorTracePointer: {
    isBoolean: true,
  },
  useJSONSource: {
    isBoolean: true,
  },
  enforceFreshSimulatorCreation: {
    isBoolean: true,
  },
  shutdownOtherSimulators: {
    isBoolean: true,
  },
  keychainsExcludePatterns: {
    isString: true,
  },
  showSafariConsoleLog: {
    isBoolean: true,
  },
  showSafariNetworkLog: {
    isBoolean: true,
  },
  safariGarbageCollect: {
    isBoolean: true,
  },
  safariGlobalPreferences: {
    isObject: true,
  },
  safariLogAllCommunication: {
    isBoolean: true,
  },
  safariLogAllCommunicationHexDump: {
    isBoolean: true,
  },
  safariSocketChunkSize: {
    isNumber: true,
  },
  mjpegServerPort: {
    isNumber: true,
  },
  reduceMotion: {
    isBoolean: true,
  },
  reduceTransparency: {
    isBoolean: true,
  },
  autoFillPasswords: {
    isBoolean: true,
  },
  mjpegScreenshotUrl: {
    isString: true,
  },
  permissions: {
    isString: true,
  },
  screenshotQuality: {
    isNumber: true,
  },
  wdaEventloopIdleDelay: {
    isNumber: true,
  },
  otherApps: {
    isString: true,
  },
  includeSafariInWebviews: {
    isBoolean: true,
  },
  additionalWebviewBundleIds: {
    // recognize the capability
    // but validate in driver#validateDesiredCaps
  },
  webviewConnectTimeout: {
    isNumber: true,
  },
  webviewAtomWaitTimeout: {
    isNumber: true,
  },
  iosSimulatorLogsPredicate: {
    isString: true,
  },
  appPushTimeout: {
    isNumber: true,
  },
  nativeWebTapStrict: {
    isBoolean: true,
  },
  safariWebInspectorMaxFrameLength: {
    isNumber: true,
  },
  allowProvisioningDeviceRegistration: {
    isBoolean: true,
  },
  waitForIdleTimeout: {
    isNumber: true,
  },
  resultBundlePath: {
    isString: true,
  },
  resultBundleVersion: {
    isNumber: true,
  },
  safariIgnoreWebHostnames: {
    isString: true,
  },
  disableAutomaticScreenshots: {
    isBoolean: true,
  },
  shouldTerminateApp: {
    isBoolean: true,
  },
  forceAppLaunch: {
    isBoolean: true,
  },
  useNativeCachingStrategy: {
    isBoolean: true,
  },
  appInstallStrategy: {
    deprecated: true,
    isString: true,
    inclusionCaseInsensitive: ['serial', 'parallel', 'ios-deploy'],
  },
  enforceAppInstall: {
    isBoolean: true,
  },
  skipTriggerInputEventAfterSendkeys: {
    isBoolean: true,
  },
  sendKeyStrategy: {
    isString: true,
  },
  skipSyncUiDialogTranslation: {
    isBoolean: true,
  },
  forceSimulatorSoftwareKeyboardPresence: {
    isBoolean: true,
  },
  appLaunchStateTimeoutSec: {
    isNumber: true,
  },
  appTimeZone: {
    isString: true,
  },
  pageLoadStrategy: {
    isString: true,
    inclusionCaseInsensitive: ['none', 'eager', 'normal']
  }
});

export {desiredCapConstraints, PLATFORM_NAME_IOS, PLATFORM_NAME_TVOS};
export default desiredCapConstraints;
