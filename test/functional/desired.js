import uiCatalog from 'ios-uicatalog';
import { absolute } from 'ios-test-app';
import _ from 'lodash';
import path from 'path';


const PLATFORM_VERSION = process.env.PLATFORM_VERSION ? process.env.PLATFORM_VERSION : '9.3';

const REAL_DEVICE = !!process.env.REAL_DEVICE;
const REAL_DEVICE_CAPS = REAL_DEVICE ? {udid: 'auto'} : {};

const GENERIC_CAPS = {
  platformName: 'iOS',
  platformVersion: PLATFORM_VERSION,
  deviceName: 'iPhone 6',
  automationName: 'XCUITest'
};

const UICATALOG_CAPS = _.defaults({
  app: path.resolve('.', 'node_modules', 'ios-uicatalog', uiCatalog[REAL_DEVICE ? 0 : 1]),
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

const UICATALOG_SIM_CAPS = _.defaults({
  app: path.resolve('.', 'node_modules', 'ios-uicatalog', uiCatalog[1]),
}, GENERIC_CAPS);

const TESTAPP_CAPS = _.defaults({
  app: REAL_DEVICE ? absolute.iphoneos : absolute.iphonesimulator,
  bundleId: 'io.appium.TestApp',
}, GENERIC_CAPS, REAL_DEVICE_CAPS);

const TESTAPP_SIM_CAPS = _.defaults({
  app: absolute.iphonesimulator,
  bundleId: 'io.appium.TestApp',
}, GENERIC_CAPS);

export { UICATALOG_CAPS, UICATALOG_SIM_CAPS, TESTAPP_CAPS, TESTAPP_SIM_CAPS, PLATFORM_VERSION };
