import _ from 'lodash';
import path from 'path';
import {util, node} from 'appium/support';

// translate integer environment variable to a boolean 0=false, !0=true
function checkFeatureInEnv(envArg) {
  /** @type {string|number} */
  let feature = parseInt(String(process.env[envArg]), 10);
  if (isNaN(feature)) {
    feature = String(process.env[envArg]);
  }
  return !!feature;
}

export function amendCapabilities(baseCaps, ...newCaps) {
  return node.deepFreeze({
    alwaysMatch: _.cloneDeep(Object.assign({}, baseCaps.alwaysMatch, ...newCaps)),
    firstMatch: [{}],
  });
}

export function extractCapabilityValue(caps, capName) {
  return caps?.alwaysMatch?.[capName];
}

export const PLATFORM_VERSION = process.env.PLATFORM_VERSION || '17.4';
export const DEVICE_NAME = process.env.DEVICE_NAME || 'iPhone 15';
const DEVICE_NAME_FOR_TOUCH_ID = process.env.DEVICE_NAME_FOR_TOUCH_ID || 'iPhone 15';
export const DEVICE_NAME_FOR_SAFARI_IPAD = process.env.DEVICE_NAME_FOR_SAFARI_IPAD || 'iPad Simulator';
const LAUNCH_WITH_IDB = checkFeatureInEnv('LAUNCH_WITH_IDB');
const SHOW_XCODE_LOG = checkFeatureInEnv('SHOW_XCODE_LOG');
const APPS = {
  uiCatalogApp: path.resolve(
    __dirname,
    '..',
    'assets',
    'UIKitCatalog-iphonesimulator.app',
  ), // https://github.com/appium/ios-uicatalog
  iosTestApp: path.resolve(__dirname, '..', 'assets', 'TestApp-iphonesimulator.app'), // https://github.com/appium/ios-test-app
  biometricApp: path.resolve(__dirname, '..', 'assets', 'biometric.app'), // https://github.com/mwakizaka/LocalAuthentication
};

const initTimeout = 60 * 1000 * 4;
const prebuiltWdaOpts = process.env.PREBUILT_WDA_PATH
  ? {
    'appium:usePreinstalledWDA': true,
    'appium:prebuiltWDAPath': process.env.PREBUILT_WDA_PATH,
  } : {};
export const GENERIC_CAPS = node.deepFreeze({
  alwaysMatch: {
    platformName: 'iOS',
    'appium:platformVersion': PLATFORM_VERSION,
    'appium:deviceName': DEVICE_NAME,
    'appium:automationName': 'XCUITest',
    'appium:launchWithIDB': LAUNCH_WITH_IDB,
    'appium:noReset': true,
    'appium:maxTypingFrequency': 30,
    'appium:clearSystemFiles': true,
    'appium:showXcodeLog': SHOW_XCODE_LOG,
    'appium:wdaLaunchTimeout': initTimeout,
    'appium:wdaConnectionTimeout': initTimeout,
    'appium:webviewConnectTimeout': Math.round(initTimeout * 0.8),
    'appium:simulatorStartupTimeout': initTimeout,
    'appium:forceAppLaunch': true,
    ...prebuiltWdaOpts,
  },
  firstMatch: [{}],
});

/**
 *
 * @param {string} minVersion
 * @returns {boolean}
 */
export function isIosVersionAtLeast(minVersion) {
  return util.compareVersions(PLATFORM_VERSION, '>=', minVersion);
}

/**
 *
 * @param {string} minVersion
 * @returns {boolean}
 */
export function isIosVersionBelow(maxVersion) {
  return util.compareVersions(PLATFORM_VERSION, '<', maxVersion);
}

export const UICATALOG_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': APPS.uiCatalogApp,
});

export const UICATALOG_SIM_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': APPS.uiCatalogApp,
  'appium:noReset': false,
}); // do not want to have no reset on the tests that use this

export const SETTINGS_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:bundleId': 'com.apple.Preferences',
});

export const SAFARI_CAPS = amendCapabilities(GENERIC_CAPS, {
  browserName: 'Safari',
  'appium:nativeWebTap': false,
});

export const TESTAPP_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': APPS.iosTestApp,
});

export const MULTIPLE_APPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': APPS.uiCatalogApp,
  'appium:otherApps': APPS.iosTestApp,
});

export const TOUCHIDAPP_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': APPS.biometricApp,
  'appium:deviceName': DEVICE_NAME_FOR_TOUCH_ID,
});

export const FACEIDAPP_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': APPS.biometricApp,
});

export const TVOS_CAPS = amendCapabilities(GENERIC_CAPS, {
  platformName: 'tvOS',
  'appium:bundleId': 'com.apple.TVSettings',
  'appium:deviceName': 'Apple TV',
});
