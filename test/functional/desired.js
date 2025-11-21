import _ from 'lodash';
import {util, node} from 'appium/support';
import {getUIKitCatalogPath, getTestAppPath} from '../setup.js';

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
export const DEVICE_NAME_FOR_SAFARI_IPAD = process.env.DEVICE_NAME_FOR_SAFARI_IPAD || 'iPad Simulator';
const SHOW_XCODE_LOG = checkFeatureInEnv('SHOW_XCODE_LOG');


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

// Export async getter functions for caps
export async function getUICatalogCaps() {
  const uiCatalogApp = await getUIKitCatalogPath();
  return amendCapabilities(GENERIC_CAPS, {
    'appium:app': uiCatalogApp,
  });
}

export async function getUICatalogSimCaps() {
  const uiCatalogApp = await getUIKitCatalogPath();
  return amendCapabilities(GENERIC_CAPS, {
    'appium:app': uiCatalogApp,
    'appium:noReset': false,
  }); // do not want to have no reset on the tests that use this
}

export async function getMultipleApps() {
  const [uiCatalogApp, testApp] = await Promise.all([
    getUIKitCatalogPath(),
    getTestAppPath(),
  ]);
  return amendCapabilities(GENERIC_CAPS, {
    'appium:app': uiCatalogApp,
    'appium:otherApps': testApp,
  });
}

// Note: Tests should use getUICatalogCaps(), getUICatalogSimCaps(), or getMultipleApps() directly

export const SETTINGS_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:bundleId': 'com.apple.Preferences',
});

export const SAFARI_CAPS = amendCapabilities(GENERIC_CAPS, {
  browserName: 'Safari',
  'appium:nativeWebTap': false,
});

export async function getTestAppCaps() {
  const testApp = await getTestAppPath();
  return amendCapabilities(GENERIC_CAPS, {
    'appium:app': testApp,
  });
}

export const TVOS_CAPS = amendCapabilities(GENERIC_CAPS, {
  platformName: 'tvOS',
  'appium:bundleId': 'com.apple.TVSettings',
  'appium:deviceName': 'Apple TV',
});
