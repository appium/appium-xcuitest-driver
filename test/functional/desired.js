import _ from 'lodash';
import path from 'path';
import { util, node } from 'appium/support';


// translate integer environment variable to a boolean 0=false, !0=true
function checkFeatureInEnv (envArg) {
  let feature = parseInt(process.env[envArg], 10);
  if (isNaN(feature)) {
    feature = process.env[envArg];
  }
  return !!feature;
}

function amendCapabilities (baseCaps, ...newCaps) {
  return node.deepFreeze({
    alwaysMatch: _.cloneDeep(Object.assign({}, baseCaps.alwaysMatch, ...newCaps)),
    firstMatch: [{}],
  });
}

function extractCapabilityValue (caps, capName) {
  return caps?.alwaysMatch?.[capName];
}

const PLATFORM_VERSION = process.env.PLATFORM_VERSION ? process.env.PLATFORM_VERSION : '11.3';
const IS_ABOVE_IOS13 = util.compareVersions(PLATFORM_VERSION, '>=', '13.0');
const DEVICE_NAME = process.env.DEVICE_NAME
  ? process.env.DEVICE_NAME
  : (IS_ABOVE_IOS13 ? 'iPhone 8' : 'iPhone 6');
const LAUNCH_WITH_IDB = checkFeatureInEnv('LAUNCH_WITH_IDB');
const SHOW_XCODE_LOG = checkFeatureInEnv('SHOW_XCODE_LOG');
const APPS = {
  uiCatalogApp: path.resolve(__dirname, '..', 'assets',
    `${IS_ABOVE_IOS13 ? 'UIKitCatalog' : 'UICatalog'}-iphonesimulator.app`),
  iosTestApp: path.resolve(__dirname, '..', 'assets', 'TestApp-iphonesimulator.app')
};


const initTimeout = 60 * 1000 * (process.env.CI ? 8 : 4);
const GENERIC_CAPS = node.deepFreeze({
  alwaysMatch: {
    platformName: 'iOS',
    'appium:platformVersion': PLATFORM_VERSION,
    'appium:deviceName': DEVICE_NAME,
    'appium:automationName': 'XCUITest',
    'appium:launchWithIDB': LAUNCH_WITH_IDB,
    'appium:maxTypingFrequency': 30,
    'appium:clearSystemFiles': true,
    'appium:showXcodeLog': SHOW_XCODE_LOG,
    'appium:wdaLaunchTimeout': initTimeout,
    'appium:wdaConnectionTimeout': initTimeout,
    'appium:useNewWDA': true,
    'appium:webviewConnectTimeout': 30000,
    'appium:simulatorStartupTimeout': initTimeout,
  },
  firstMatch: [{}],
});

const UICATALOG_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': APPS.uiCatalogApp,
});

const UICATALOG_SIM_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': APPS.uiCatalogApp,
  'appium:noReset': false,
}); // do not want to have no reset on the tests that use this

const SETTINGS_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:bundleId': 'com.apple.Preferences'
});

const SAFARI_CAPS = amendCapabilities(GENERIC_CAPS, {
  'browserName': 'Safari',
  'appium:nativeWebTap': false,
});

const TESTAPP_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': APPS.iosTestApp,
});

const MULTIPLE_APPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': APPS.uiCatalogApp,
  'appium:otherApps': APPS.iosTestApp,
});

const TOUCHIDAPP_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': APPS.touchIdApp,
});

const TVOS_CAPS = amendCapabilities(GENERIC_CAPS, {
  platformName: 'tvOS',
  'appium:bundleId': 'com.apple.TVSettings',
  'appium:deviceName': 'Apple TV',
});

export {
  UICATALOG_CAPS, UICATALOG_SIM_CAPS, SAFARI_CAPS, TESTAPP_CAPS,
  PLATFORM_VERSION, TOUCHIDAPP_CAPS, DEVICE_NAME, SETTINGS_CAPS,
  TVOS_CAPS, MULTIPLE_APPS, GENERIC_CAPS, amendCapabilities, extractCapabilityValue,
};
