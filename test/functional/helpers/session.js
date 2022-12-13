import { remote } from 'webdriverio';
import { extractCapabilityValue } from '../desired';

const HOST = process.env.APPIUM_TEST_SERVER_HOST || '127.0.0.1';
const PORT = parseInt(process.env.APPIUM_TEST_SERVER_PORT, 10) || 4567;
// on CI the timeout needs to be long, mostly so WDA can be built the first time
const MOCHA_TIMEOUT = 60 * 1000 * (process.env.CI ? 8 : 4);

let driver;
let builtDefaultWDA = false;

async function initSession (caps, remoteOpts = {}) {
  driver = await remote({
    hostname: HOST,
    port: PORT,
    capabilities: caps,
    connectionRetryTimeout: MOCHA_TIMEOUT,
    connectionRetryCount: 1,
    ...remoteOpts,
  });
  driver.name = undefined;
  driver.errored = false;

  if (!extractCapabilityValue(caps, 'appium:usePrebuiltWDA') && !extractCapabilityValue(caps, 'appium:derivedDataPath')) {
    builtDefaultWDA = true;
  }

  return driver;
}

async function deleteSession () {
  try {
    await driver.deleteSession();
  } catch (ign) {
  } finally {
    driver = undefined;
  }
}

function hasDefaultPrebuiltWDA() {
  return builtDefaultWDA;
}

export { initSession, deleteSession, hasDefaultPrebuiltWDA, HOST, PORT, MOCHA_TIMEOUT };
