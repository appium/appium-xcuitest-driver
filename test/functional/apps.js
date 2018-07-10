import path from 'path';

let testAppPath, uiCatalogApp;

// Had to make these two optional dependencies so the tests
// can still run in linux
if (process.platform === 'darwin') {
  testAppPath = require('ios-test-app').absolute;
  uiCatalogApp = require('ios-uicatalog');
}

const apps = {};

const {REAL_DEVICE, CLOUD} = process.env;

if (REAL_DEVICE) {
  if (CLOUD) {
    apps.testAppId = 1;
  } else {
    apps.iosTestApp = testAppPath.iphoneos;
    apps.uiCatalogApp = path.resolve('.', 'node_modules', 'ios-uicatalog', uiCatalogApp[0]);
  }
} else {
  if (CLOUD) {
    apps.iosTestApp = 'http://appium.github.io/appium/assets/TestApp7.1.app.zip';
    apps.uiCatalogApp = 'http://appium.github.io/appium/assets/UICatalog7.1.app.zip';
    apps.touchIdApp = null; // TODO: Upload this to appium.io
  } else {
    apps.iosTestApp = testAppPath.iphonesimulator;
    apps.uiCatalogApp = path.resolve('.', 'node_modules', 'ios-uicatalog', uiCatalogApp[1]);
    apps.touchIdApp = path.resolve('.', 'test', 'assets', 'TouchIDExample.app');
  }
}

console.log('@@@@@apps', apps);

export default apps;