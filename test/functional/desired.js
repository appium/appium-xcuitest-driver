import _ from 'lodash';
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import apps from './apps';

const PLATFORM_VERSION = process.env.PLATFORM_VERSION ? process.env.PLATFORM_VERSION : '11.3';
const DEVICE_NAME = process.env.DEVICE_NAME ? process.env.DEVICE_NAME : 'iPhone 6';
const SHOW_XCODE_LOG = !!process.env.SHOW_XCODE_LOG;
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
} : {};

const GENERIC_CAPS = {
  platformName: 'iOS',
  platformVersion: PLATFORM_VERSION,
  deviceName: DEVICE_NAME,
  automationName: 'XCUITest',
  noReset: true,
  maxTypingFrequency: 30,
  clearSystemFiles: true,
  showXcodeLog: SHOW_XCODE_LOG,
  // TODO: If it's SAUCE_EMUSIM or SAUCE_RDC add the appium staging URL
};

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

const SAFARI_CAPS = _.defaults({
  browserName: 'Safari',
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

const TESTAPP_CAPS = _.defaults({
  app: apps.iosTestApp,
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

export {
  UICATALOG_CAPS, UICATALOG_SIM_CAPS, SAFARI_CAPS, TESTAPP_CAPS,
  PLATFORM_VERSION, TOUCHIDAPP_CAPS, DEVICE_NAME, W3C_CAPS
};
