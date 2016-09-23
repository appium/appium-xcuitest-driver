import uiCatalogApp from 'ios-uicatalog';
import { absolute } from 'ios-test-app';
import iosWebViewApp from 'ios-webview-app';
import _ from 'lodash';
import path from 'path';


const PLATFORM_VERSION = process.env.PLATFORM_VERSION ? process.env.PLATFORM_VERSION : '9.3';
const DEVICE_NAME = process.env.DEVICE_NAME ? process.env.DEVICE_NAME : 'iPhone 6';

const REAL_DEVICE = !!process.env.REAL_DEVICE;
const REAL_DEVICE_CAPS = REAL_DEVICE ? {udid: 'auto'} : {};

const GENERIC_CAPS = {
  platformName: 'iOS',
  platformVersion: PLATFORM_VERSION,
  deviceName: DEVICE_NAME,
  automationName: 'XCUITest'
};

const UICATALOG_CAPS = _.defaults({
  app: path.resolve('.', 'node_modules', 'ios-uicatalog', uiCatalogApp[REAL_DEVICE ? 0 : 1]),
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

const UICATALOG_SIM_CAPS = _.defaults({
  app: path.resolve('.', 'node_modules', 'ios-uicatalog', uiCatalogApp[1]),
}, GENERIC_CAPS);


// building the test app, especially on Travis, often fails
// so use static one. Keep the npm-installed one so real device tests can be
// run
let testAppSim = path.resolve('test', 'assets', 'TestApp-iphonesimulator.app');

const TESTAPP_CAPS = _.defaults({
  app: REAL_DEVICE ? absolute.iphoneos : testAppSim,
  bundleId: 'io.appium.TestApp',
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

const TESTAPP_SIM_CAPS = _.defaults({
  app: testAppSim,
  bundleId: 'io.appium.TestApp',
}, GENERIC_CAPS);

const WEBVIEW_CAPS = _.defaults({
  app: path.resolve('.', 'node_modules', 'ios-webview-app', iosWebViewApp[REAL_DEVICE ? 0 : 1]),
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

const WEBVIEW_SIM_CAPS = _.defaults({
  app: path.resolve('.', 'node_modules', 'ios-webview-app', iosWebViewApp[1]),
}, GENERIC_CAPS);

const SAFARI_CAPS = _.defaults({
  browserName: 'Safari',
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

export { UICATALOG_CAPS, UICATALOG_SIM_CAPS, TESTAPP_CAPS, TESTAPP_SIM_CAPS,
         WEBVIEW_CAPS, WEBVIEW_SIM_CAPS, SAFARI_CAPS, PLATFORM_VERSION };
