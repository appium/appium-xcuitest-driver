import {extractCapabilityValue} from '../desired';

const HOST = process.env.APPIUM_TEST_SERVER_HOST || '127.0.0.1';
const PORT = parseInt(String(process.env.APPIUM_TEST_SERVER_PORT), 10) || 4567;
// on CI the timeout needs to be long, mostly so WDA can be built the first time
const MOCHA_TIMEOUT = 60 * 1000 * (process.env.CI ? 16 : 4);

let driver;
let didBuildWda = false;

async function initSession(caps, remoteOpts = {}) {
  try {
    const {remote} = await import('webdriverio');
    driver = await remote({
      hostname: HOST,
      port: PORT,
      capabilities: caps,
      connectionRetryTimeout: MOCHA_TIMEOUT,
      connectionRetryCount: 1,
      ...remoteOpts,
    });
    if (
      !extractCapabilityValue(caps, 'appium:usePrebuiltWDA') &&
      !extractCapabilityValue(caps, 'appium:derivedDataPath')
    ) {
      didBuildWda = true;
    }
  } catch (e) {
    didBuildWda = false;
    throw e;
  }
  // @ts-expect-error private API, apparently
  driver.name = undefined;
  // @ts-expect-error private API, apparently
  driver.errored = false;
  return driver;
}

async function deleteSession() {
  try {
    await driver.deleteSession();
  } catch {
  } finally {
    driver = undefined;
  }
}

function hasDefaultPrebuiltWDA() {
  return didBuildWda;
}

export {initSession, deleteSession, hasDefaultPrebuiltWDA, HOST, PORT, MOCHA_TIMEOUT};
