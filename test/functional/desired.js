import _ from 'lodash';
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import { system, util } from '@appium/support';


// translate integer environment variable to a boolean 0=false, !0=true
function checkFeatureInEnv (envArg) {
  let feature = parseInt(process.env[envArg], 10);
  if (isNaN(feature)) {
    feature = process.env[envArg];
  }
  return !!feature;
}

function deepFreeze (object) {
  const propNames = Object.getOwnPropertyNames(object);
  for (const name of propNames) {
    const value = object[name];
    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  }
  return Object.freeze(object);
}

function amendCapabilities (baseCaps, ...newCaps) {
  return deepFreeze({
    alwaysMatch: _.cloneDeep(Object.assign({}, baseCaps.alwaysMatch, ...newCaps)),
    firstMatch: [{}],
  });
}

function extractCapabilityValue (caps, capName) {
  return caps.alwaysMatch[capName];
}

const PLATFORM_VERSION = process.env.PLATFORM_VERSION ? process.env.PLATFORM_VERSION : '11.3';

// If it's real device cloud, don't set a device name. Use dynamic device allocation.
const DEVICE_NAME = process.env.DEVICE_NAME
  ? process.env.DEVICE_NAME
  : process.env.SAUCE_RDC
    ? undefined
    : util.compareVersions(PLATFORM_VERSION, '>=', '13.0') ? 'iPhone 8' : 'iPhone 6';

const LAUNCH_WITH_IDB = checkFeatureInEnv('LAUNCH_WITH_IDB');
const SHOW_XCODE_LOG = checkFeatureInEnv('SHOW_XCODE_LOG');
const REAL_DEVICE = checkFeatureInEnv('REAL_DEVICE');
let XCCONFIG_FILE = process.env.XCCONFIG_FILE;
if (REAL_DEVICE && !XCCONFIG_FILE) {
  // no xcconfig file specified, so try to find in the root directory of the package
  // this happens once, at the start of a test run, so using sync method is ok
  let cwd = path.resolve(__dirname, '..', '..', '..');
  let files = glob.sync('*.xcconfig', { cwd });
  if (files.length) {
    XCCONFIG_FILE = path.resolve(cwd, _.first(files));
  }
}

// Had to make these two optional dependencies so the tests
// can still run in linux
let testAppPath, uiCatalogPath;
if (system.isMac() && !process.env.CLOUD) {
  testAppPath = require('ios-test-app').absolute;

  // iOS 13+ need a slightly different app to be able to get the correct automation
  uiCatalogPath = parseInt(PLATFORM_VERSION, 10) >= 13
    ? require('ios-uicatalog').uiKitCatalog.absolute
    : require('ios-uicatalog').uiCatalog.absolute;
}

const apps = {};
const CLOUD = process.env.CLOUD;
if (REAL_DEVICE) {
  if (CLOUD) {
    apps.testAppId = 1;
  } else {
    apps.iosTestApp = testAppPath.iphoneos;
    apps.uiCatalogApp = uiCatalogPath.iphoneos;
  }
} else {
  if (CLOUD) {
    apps.iosTestApp = 'http://appium.github.io/appium/assets/TestApp9.4.app.zip';
    apps.uiCatalogApp = 'http://appium.github.io/appium/assets/UICatalog9.4.app.zip';
    apps.touchIdApp = null; // TODO: Upload this to appium.io
  } else {
    apps.iosTestApp = testAppPath.iphonesimulator;
    apps.uiCatalogApp = uiCatalogPath.iphonesimulator;
    apps.touchIdApp = path.resolve('.', 'test', 'assets', 'TouchIDExample.app');
  }
}
// on Travis, when load is high, the app often fails to build,
// and tests fail, so use static one in assets if necessary,
// but prefer to have one build locally
// only do this for sim, since real device one needs to be built with dev creds
if (!REAL_DEVICE && !process.env.CLOUD) {
  // this happens a single time, at load-time for the test suite,
  // so sync method is not overly problematic
  if (!fs.existsSync(apps.uiCatalogApp)) {
    apps.uiCatalogApp = path.resolve('.', 'test', 'assets',
      `${parseInt(PLATFORM_VERSION, 10) >= 13 ? 'UIKitCatalog' : 'UICatalog'}-iphonesimulator.app`);
  }
  if (!fs.existsSync(apps.iosTestApp)) {
    apps.iosTestApp = path.resolve('.', 'test', 'assets', 'TestApp-iphonesimulator.app');
  }
}

const GENERIC_CAPS = deepFreeze({
  platformName: 'iOS',
  'appium:platformVersion': PLATFORM_VERSION,
  'appium:deviceName': DEVICE_NAME,
  'appium:automationName': 'XCUITest',
  'appium:launchWithIDB': LAUNCH_WITH_IDB,
  'appium:noReset': true,
  'appium:maxTypingFrequency': 30,
  'appium:clearSystemFiles': true,
  'appium:showXcodeLog': SHOW_XCODE_LOG,
  'appium:wdaLaunchTimeout': (60 * 1000 * 4),
  'appium:wdaConnectionTimeout': (60 * 1000 * 8),
  'appium:useNewWDA': true,
  'appium:webviewConnectTimeout': 30000,
  'appium:simulatorStartupTimeout': (1000 * 60 * 4),
});

const UICATALOG_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': apps.uiCatalogApp,
});

const UICATALOG_SIM_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': apps.uiCatalogApp,
  'appium:noReset': false,
}); // do not want to have no reset on the tests that use this

const SETTINGS_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:bundleId': 'com.apple.Preferences'
});

const SAFARI_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:browserName': 'Safari',
  'appium:nativeWebTap': false,
});

const TESTAPP_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': apps.iosTestApp,
});

const MULTIPLE_APPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': apps.uiCatalogApp,
  'appium:otherApps': apps.iosTestApp,
});

const TOUCHIDAPP_CAPS = amendCapabilities(GENERIC_CAPS, {
  'appium:app': apps.touchIdApp,
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
