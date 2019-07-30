import _ from 'lodash';
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import apps from './apps';


const PLATFORM_VERSION = process.env.PLATFORM_VERSION ? process.env.PLATFORM_VERSION : '11.3';
let DEVICE_NAME = process.env.DEVICE_NAME;

// If it's real device cloud, don't set a device name. Use dynamic device allocation.
if (!process.env.DEVICE_NAME && !process.env.SAUCE_RDC) {
  DEVICE_NAME = 'iPhone 6';
}

const SHOW_XCODE_LOG = !!process.env.SHOW_XCODE_LOG || undefined; // we do not want `false` in Travis, so we get some logging on errors
const REAL_DEVICE = (function () {
  let rd = parseInt(process.env.REAL_DEVICE, 10);
  if (isNaN(rd)) {
    rd = process.env.REAL_DEVICE;
  }
  return !!rd;
})();
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

const REAL_DEVICE_CAPS = REAL_DEVICE ? {
  udid: 'auto',
  xcodeConfigFile: XCCONFIG_FILE,
  webkitResponseTimeout: 30000,
  testobject_app_id: apps.testAppId,
  testobject_api_key: process.env.SAUCE_RDC_ACCESS_KEY,
  testobject_remote_appium_url: process.env.APPIUM_STAGING_URL, // TODO: Once RDC starts supporting this again, re-insert this
} : {};

let GENERIC_CAPS = {
  platformName: 'iOS',
  platformVersion: PLATFORM_VERSION,
  deviceName: DEVICE_NAME,
  automationName: 'XCUITest',
  noReset: true,
  maxTypingFrequency: 30,
  clearSystemFiles: true,
  showXcodeLog: SHOW_XCODE_LOG,
  wdaLaunchTimeout: (60 * 1000 * 4),
  wdaConnectionTimeout: (60 * 1000 * 8),
  useNewWDA: true,
};

if (process.env.CLOUD) {
  GENERIC_CAPS.platformVersion = process.env.CLOUD_PLATFORM_VERSION;
  GENERIC_CAPS.build = process.env.SAUCE_BUILD;
  GENERIC_CAPS.showIOSLog = false;
  GENERIC_CAPS[process.env.APPIUM_BUNDLE_CAP || 'appium-version'] = {'appium-url': 'sauce-storage:appium.zip'};
  // TODO: If it's SAUCE_RDC add the appium staging URL

  // `name` will be set during session initialization
}

// on Travis, when load is high, the app often fails to build,
// and tests fail, so use static one in assets if necessary,
// but prefer to have one build locally
// only do this for sim, since real device one needs to be built with dev creds
if (!REAL_DEVICE && !process.env.CLOUD) {
  // this happens a single time, at load-time for the test suite,
  // so sync method is not overly problematic
  if (!fs.existsSync(apps.uiCatalogApp)) {
    apps.uiCatalogApp = path.resolve('.', 'test', 'assets', 'UICatalog-iphonesimulator.app');
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
