import uiCatalog from 'ios-uicatalog';
import { absolute } from 'ios-test-app';
import _ from 'lodash';
import path from 'path';


const GENERIC_CAPS = {
  platformName: 'iOS',
  platformVersion: '9.3',
  deviceName: 'iPhone 6',
  automationName: 'XCUITest'
};

const UICATALOG_CAPS = _.defaults({
  app: path.resolve('.', 'node_modules', 'ios-uicatalog', uiCatalog[1]),
}, GENERIC_CAPS);

const TESTAPP_CAPS = _.defaults({
  app: absolute.iphonesimulator,
  bundleId: 'io.appium.TestApp',
}, GENERIC_CAPS);

export { UICATALOG_CAPS, TESTAPP_CAPS };
