import _ from 'lodash';
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import { system } from 'appium-support';


// translate integer environment variable to a boolean 0=false, !0=true
function checkFeatureInEnv (envArg) {
  let feature = parseInt(process.env[envArg], 10);
  if (isNaN(feature)) {
    feature = process.env[envArg];
  }
  return !!feature;
}

const PLATFORM_VERSION = process.env.PLATFORM_VERSION ? process.env.PLATFORM_VERSION : '11.3';
const LAUNCH_WITH_IDB = process.env.LAUNCH_WITH_IDB;

const DEVICE_NAME = process.env.DEVICE_NAME || 'iPhone Simulator';

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
if (system.isMac() && !process.env.REMOTE) {
  testAppPath = require('ios-test-app').absolute;

  // iOS 13+ need a slightly different app to be able to get the correct automation
  uiCatalogPath = parseInt(PLATFORM_VERSION, 10) >= 13
    ? require('ios-uicatalog').uiKitCatalog.absolute
    : require('ios-uicatalog').uiCatalog.absolute;
}

const apps = {};

const REMOTE = process.env.REMOTE;

if (REAL_DEVICE) {
  if (REMOTE) {
    apps.testAppId = 1;
  } else {
    apps.iosTestApp = testAppPath.iphoneos;
    apps.uiCatalogApp = uiCatalogPath.iphoneos;
  }
} else {
  if (REMOTE) {
    apps.iosTestApp = 'http://appium.github.io/appium/assets/TestApp9.4.app.zip';
    apps.uiCatalogApp = 'http://appium.github.io/appium/assets/UICatalog9.4.app.zip';
    apps.touchIdApp = null; // TODO: Upload this to appium.io
  } else {
    apps.iosTestApp = testAppPath.iphonesimulator;
    apps.uiCatalogApp = uiCatalogPath.iphonesimulator;
    apps.touchIdApp = path.resolve('.', 'test', 'assets', 'TouchIDExample.app');
  }
}

const REAL_DEVICE_CAPS = REAL_DEVICE ? {
  udid: 'auto',
  xcodeConfigFile: XCCONFIG_FILE,
  webkitResponseTimeout: 30000,
} : {};

let GENERIC_CAPS = {
  platformName: 'iOS',
  platformVersion: PLATFORM_VERSION,
  deviceName: DEVICE_NAME,
  automationName: 'XCUITest',
  launchWithIDB: !!LAUNCH_WITH_IDB,
  noReset: true,
  maxTypingFrequency: 30,
  clearSystemFiles: true,
  showXcodeLog: SHOW_XCODE_LOG,
  wdaLaunchTimeout: (60 * 1000 * 4),
  wdaConnectionTimeout: (60 * 1000 * 8),
  useNewWDA: true,
  webviewConnectTimeout: 30000,
  appiumVersion: process.env.APPIUM_VERSION,
};

if (process.env.SAUCE_BUILD) {
  GENERIC_CAPS.build = process.env.SAUCE_BUILD;
  GENERIC_CAPS.showIOSLog = false;
  GENERIC_CAPS[process.env.APPIUM_BUNDLE_CAP || 'appium-version'] = {'appium-url': 'sauce-storage:appium.zip'};

  // `name` will be set during session initialization
}

// on Travis, when load is high, the app often fails to build,
// and tests fail, so use static one in assets if necessary,
// but prefer to have one build locally
// only do this for sim, since real device one needs to be built with dev creds
if (!REAL_DEVICE && !process.env.REMOTE) {
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

const UICATALOG_CAPS = _.defaults({
  app: apps.uiCatalogApp,
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

const UICATALOG_SIM_CAPS = _.defaults({
  app: apps.uiCatalogApp,
}, GENERIC_CAPS);
delete UICATALOG_SIM_CAPS.noReset; // do not want to have no reset on the tests that use this

const SETTINGS_CAPS = _.defaults({
  bundleId: 'com.apple.Preferences'
}, GENERIC_CAPS);

const SAFARI_CAPS = _.defaults({
  browserName: 'Safari',
  testobject_api_key: process.env.SAUCE_RDC_WEB_ACCESS_KEY,
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

const TESTAPP_CAPS = _.defaults({
  app: apps.iosTestApp,
}, GENERIC_CAPS);

const MULTIPLE_APPS = _.defaults({
  app: apps.uiCatalogApp,
  otherApps: apps.iosTestApp
}, GENERIC_CAPS);

const TOUCHIDAPP_CAPS = _.defaults({
  app: apps.touchIdApp,
}, GENERIC_CAPS);

const W3C_CAPS = {
  capabilities: {
    alwaysMatch: UICATALOG_CAPS,
    firstMatch: [{}],
  }
};

let TVOS_CAPS = _.defaults({
  platformName: 'tvOS',
  bundleId: 'com.apple.TVSettings',
  deviceName: 'Apple TV'
}, GENERIC_CAPS);

export {
  UICATALOG_CAPS, UICATALOG_SIM_CAPS, SAFARI_CAPS, TESTAPP_CAPS,
  PLATFORM_VERSION, TOUCHIDAPP_CAPS, DEVICE_NAME, W3C_CAPS, SETTINGS_CAPS,
  TVOS_CAPS, MULTIPLE_APPS
};
