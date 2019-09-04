import _ from 'lodash';
import { desiredCapConstraints as iosDesiredCapConstraints } from 'appium-ios-driver';

// These platform names should be valid in simulator name
const PLATFORM_NAME_IOS = 'iOS';
const PLATFORM_NAME_TVOS = 'tvOS';

let desiredCapConstraints = _.defaults({
  platformName: { // override
    presence: true,
    isString: true,
    inclusionCaseInsensitive: [PLATFORM_NAME_IOS, PLATFORM_NAME_TVOS]
  },
  showXcodeLog: {
    isBoolean: true
  },
  wdaLocalPort: {
    isNumber: true
  },
  wdaBaseUrl: {
    isString: true
  },
  iosInstallPause: {
    isNumber: true
  },
  xcodeConfigFile: {
    isString: true
  },
  xcodeOrgId: {
    isString: true
  },
  xcodeSigningId: {
    isString: true
  },
  keychainPath: {
    isString: true
  },
  keychainPassword: {
    isString: true
  },
  bootstrapPath: {
    isString: true
  },
  agentPath: {
    isString: true
  },
  tapWithShortPressDuration: {
    isNumber: true
  },
  scaleFactor: {
    isString: true
  },
  usePrebuiltWDA: {
    isBoolean: true
  },
  customSSLCert: {
    isString: true
  },
  webDriverAgentUrl: {
    isString: true
  },
  derivedDataPath: {
    isString: true
  },
  useNewWDA: {
    isBoolean: true
  },
  wdaLaunchTimeout: {
    isNumber: true
  },
  wdaConnectionTimeout: {
    isNumber: true
  },
  updatedWDABundleId: {
    isString: true
  },
  resetOnSessionStartOnly: {
    isBoolean: true
  },
  commandTimeouts: {
    // recognize the cap,
    // but validate in the driver#validateDesiredCaps method
  },
  wdaStartupRetries: {
    isNumber: true
  },
  wdaStartupRetryInterval: {
    isNumber: true
  },
  prebuildWDA: {
    isBoolean: true
  },
  connectHardwareKeyboard: {
    isBoolean: true
  },
  calendarAccessAuthorized: {
    isBoolean: true
  },
  useSimpleBuildTest: {
    isBoolean: true
  },
  waitForQuiescence: {
    isBoolean: true
  },
  maxTypingFrequency: {
    isNumber: true
  },
  nativeTyping: {
    isBoolean: true
  },
  simpleIsVisibleCheck: {
    isBoolean: true
  },
  useCarthageSsl: {
    isBoolean: true
  },
  shouldUseSingletonTestManager: {
    isBoolean: true
  },
  isHeadless: {
    isBoolean: true
  },
  useXctestrunFile: {
    isBoolean: true
  },
  absoluteWebLocations: {
    isBoolean: true
  },
  simulatorWindowCenter: {
    isString: true
  },
  useJSONSource: {
    isBoolean: true
  },
  enforceFreshSimulatorCreation: {
    isBoolean: true
  },
  shutdownOtherSimulators: {
    isBoolean: true
  },
  keychainsExcludePatterns: {
    isString: true
  },
  showSafariConsoleLog: {
    isBoolean: true
  },
  showSafariNetworkLog: {
    isBoolean: true
  },
  safariGarbageCollect: {
    isBoolean: true
  },
  safariGlobalPreferences: {
    isObject: true
  },
  mjpegServerPort: {
    isNumber: true
  },
  reduceMotion: {
    isBoolean: true
  },
  mjpegScreenshotUrl: {
    isString: true
  },
  permissions: {
    isString: true
  },
  screenshotQuality: {
    isNumber: true
  },
  skipLogCapture: {
    isBoolean: true
  },
  wdaEventloopIdleDelay: {
    isNumber: true
  },
  otherApps: {
    isString: true
  },
  includeSafariInWebviews: {
    isBoolean: true
  },
}, iosDesiredCapConstraints);

export { desiredCapConstraints, PLATFORM_NAME_IOS, PLATFORM_NAME_TVOS };
export default desiredCapConstraints;
