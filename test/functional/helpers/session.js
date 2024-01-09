import path from 'path';
import {extractCapabilityValue, PLATFORM_VERSION} from '../desired';
import {XcodeBuild} from 'appium-webdriveragent/build/lib/xcodebuild';
import {util} from 'appium/support';

const HOST = process.env.APPIUM_TEST_SERVER_HOST || '127.0.0.1';
const PORT = parseInt(String(process.env.APPIUM_TEST_SERVER_PORT), 10) || 4567;
// on CI the timeout needs to be long, mostly so WDA can be built the first time
const MOCHA_TIMEOUT = 60 * 1000 * (process.env.CI ?
  util.compareVersions(PLATFORM_VERSION, '>=', '17.0') ? 32 : 16
  : 4);

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
  } catch (ign) {
  } finally {
    driver = undefined;
  }
}

function hasDefaultPrebuiltWDA() {
  return didBuildWda;
}

async function getUsePrebuiltWDACaps() {
  const caps = {
    'appium:usePrebuiltWDA': hasDefaultPrebuiltWDA()
  };
  if (didBuildWda) {
    caps['appium:derivedDataPath'] = await getDerivedDataPath();
  }
  return caps;
}

async function getDerivedDataPath() {
  const agentPath = path.join(__dirname, '..', '..', '..', 'node_modules', 'appium-webdriveragent', 'WebDriverAgent.xcodeproj');
  const xcodebuild = new XcodeBuild('', null, {agentPath});
  return await xcodebuild.retrieveDerivedDataPath();
}

export {initSession, deleteSession, hasDefaultPrebuiltWDA, getUsePrebuiltWDACaps, HOST, PORT, MOCHA_TIMEOUT};
