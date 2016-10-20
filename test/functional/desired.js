import uiCatalogApp from 'ios-uicatalog';
import iosWebViewApp from 'ios-webview-app';
import _ from 'lodash';
import path from 'path';
import glob from 'glob';


const PLATFORM_VERSION = process.env.PLATFORM_VERSION ? process.env.PLATFORM_VERSION : '9.3';
const DEVICE_NAME = process.env.DEVICE_NAME ? process.env.DEVICE_NAME : 'iPhone 6';

const REAL_DEVICE = !!process.env.REAL_DEVICE;
let XCCONFIG_FILE = process.env.XCCONFIG_FILE;
if (REAL_DEVICE && !XCCONFIG_FILE) {
  // no xcconfig file specified, so try to find in the root directory of the package
  // this happens once, at the start of a test run, so using sync method is ok
  let cwd = path.resolve(__dirname, '..', '..', '..');
  let files = glob.sync('*.xcconfig', {cwd});
  XCCONFIG_FILE = path.resolve(cwd, _.first(files));
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
};

const UICATALOG_CAPS = _.defaults({
  app: path.resolve('.', 'node_modules', 'ios-uicatalog', uiCatalogApp[REAL_DEVICE ? 0 : 1]),
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

const UICATALOG_SIM_CAPS = _.defaults({
  app: path.resolve('.', 'node_modules', 'ios-uicatalog', uiCatalogApp[1]),
}, GENERIC_CAPS);
delete UICATALOG_SIM_CAPS.noReset; // do not want to have no reset on the tests that use this

const WEBVIEW_CAPS = _.defaults({
  app: path.resolve('.', 'node_modules', 'ios-webview-app', iosWebViewApp[REAL_DEVICE ? 0 : 1]),
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

const WEBVIEW_SIM_CAPS = _.defaults({
  app: path.resolve('.', 'node_modules', 'ios-webview-app', iosWebViewApp[1]),
}, GENERIC_CAPS);

const SAFARI_CAPS = _.defaults({
  browserName: 'Safari',
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

export { UICATALOG_CAPS, UICATALOG_SIM_CAPS, WEBVIEW_CAPS, WEBVIEW_SIM_CAPS,
         SAFARI_CAPS, PLATFORM_VERSION };
