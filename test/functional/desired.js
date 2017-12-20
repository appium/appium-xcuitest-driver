import uiCatalogApp from 'ios-uicatalog';
import _ from 'lodash';
import path from 'path';
import glob from 'glob';
import fs from 'fs';
import { absolute as testAppPath } from 'ios-test-app';


const PLATFORM_VERSION = process.env.PLATFORM_VERSION ? process.env.PLATFORM_VERSION : '10.3';
const DEVICE_NAME = process.env.DEVICE_NAME ? process.env.DEVICE_NAME : 'iPhone 6';
const SHOW_XCODE_LOG = !!process.env.SHOW_XCODE_LOG;
const REAL_DEVICE = (function () {
  let rd = parseInt(process.env.REAL_DEVICE,  10);
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
  let files = glob.sync('*.xcconfig', {cwd});
  if (files.length) {
    XCCONFIG_FILE = path.resolve(cwd, _.first(files));
  }
}
const REAL_DEVICE_CAPS = REAL_DEVICE ? {
  udid: 'auto',
  xcodeConfigFile: XCCONFIG_FILE,
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
};

let simUICatalogApp = path.resolve('.', 'node_modules', 'ios-uicatalog', uiCatalogApp[1]);
let realUICatalogApp = process.env.UICATALOG_REAL_DEVICE || path.resolve('.', 'node_modules', 'ios-uicatalog', uiCatalogApp[0]);

// no real device tests use TestApp
let simTestAppApp = testAppPath.iphonesimulator;

// on Travis, when load is high, the app often fails to build,
// and tests fail, so use static one in assets if necessary,
// but prefer to have one build locally
// only do this for sim, since real device one needs to be built with dev creds
if (!REAL_DEVICE) {
  // this happens a single time, at load-time for the test suite,
  // so sync method is not overly problematic
  if (!fs.existsSync(simUICatalogApp)) {
    simUICatalogApp = path.resolve('.', 'test', 'assets', 'UICatalog-iphonesimulator.app');
  }
  if (!fs.existsSync(testAppPath.iphonesimulator)) {
    simTestAppApp = path.resolve('.', 'test', 'assets', 'TestApp-iphonesimulator.app');
  }
}

const UICATALOG_CAPS = _.defaults({
  app: REAL_DEVICE ? realUICatalogApp : simUICatalogApp,
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

const UICATALOG_SIM_CAPS = _.defaults({
  app: simUICatalogApp,
}, GENERIC_CAPS);
delete UICATALOG_SIM_CAPS.noReset; // do not want to have no reset on the tests that use this

const SAFARI_CAPS = _.defaults({
  browserName: 'Safari',
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

const TESTAPP_CAPS = _.defaults({
  app: simTestAppApp,
}, GENERIC_CAPS);

const TOUCHIDAPP_CAPS = _.defaults({
  app: path.resolve('.', 'test', 'assets', 'TouchIDExample.app'),
}, GENERIC_CAPS);

const W3C_CAPS = {
  capabilities: {
    alwaysMatch: UICATALOG_CAPS,
    firstMatch: [{}],
  }
};

export { UICATALOG_CAPS, UICATALOG_SIM_CAPS, SAFARI_CAPS, TESTAPP_CAPS,
         PLATFORM_VERSION, TOUCHIDAPP_CAPS, DEVICE_NAME, W3C_CAPS };
