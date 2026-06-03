import {retryInterval} from 'asyncbox';
import {getSimulator} from 'appium-ios-simulator';
import {Simctl} from 'node-simctl';
import type {Browser} from 'webdriverio';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {
  amendCapabilities,
  extractCapabilityValue,
  getUICatalogSimCaps,
} from '../desired';
import {assertSessionClaimIpcTraces, readAppiumLog} from '../helpers/appium-log';
import {getFreePort} from '../helpers/ports';
import {cleanupSimulator, deleteDeviceWithRetry} from '../helpers/simulator';
import {
  createRemoteSession,
  deleteRemoteSession,
  MOCHA_TIMEOUT,
} from '../helpers/session';

chai.use(chaiAsPromised);

const SIM_DEVICE_NAME = 'xcuitestSessionClaimTest';

async function createDevice() {
  const simctl = new Simctl();
  return await simctl.createDevice(
    SIM_DEVICE_NAME,
    process.env.DEVICE_NAME || 'iPhone 15',
    process.env.PLATFORM_VERSION || '17.4',
  );
}

describe('XCUITestDriver - session udid claim', function () {
  this.timeout(MOCHA_TIMEOUT);

  let udid: string;
  let baseCaps: ReturnType<typeof amendCapabilities>;
  let firstDriver: Browser | undefined;
  let secondDriver: Browser | undefined;

  before(async function () {
    if (!process.env.APPIUM_LOG_PATH) {
      this.skip();
      return;
    }

    udid = await createDevice();
    const uiCatalogSimCaps = await getUICatalogSimCaps();
    baseCaps = amendCapabilities(uiCatalogSimCaps, {
      'appium:udid': udid,
      'appium:usePrebuiltWDA': true,
      'appium:wdaStartupRetries': 0,
      'appium:noReset': true,
    });
  });

  afterEach(async function () {
    await deleteRemoteSession(secondDriver);
    await deleteRemoteSession(firstDriver);
    secondDriver = undefined;
    firstDriver = undefined;
  });

  after(async function () {
    const sim = await getSimulator(udid, {
      platform: 'iOS',
      checkExistence: false,
    });
    await cleanupSimulator(sim);
    await deleteDeviceWithRetry(udid);
  });

  it('should terminate the previous session when a new session claims the same udid', async function () {
    firstDriver = await createRemoteSession(baseCaps);
    expect(firstDriver.sessionId).to.be.a('string').that.is.not.empty;
    expect((await firstDriver.$$('XCUIElementTypeWindow')).length).to.be.at.least(1);

    const firstSessionId = firstDriver.sessionId;
    const wdaLocalPort = await getFreePort();
    secondDriver = await createRemoteSession(
      amendCapabilities(baseCaps, {
        'appium:wdaLocalPort': wdaLocalPort,
      }),
    );

    expect(secondDriver.sessionId).to.be.a('string').that.is.not.empty;
    expect(secondDriver.sessionId).to.not.equal(firstSessionId);

    await retryInterval(20, 500, async () => {
      await expect(firstDriver!.getWindowRect()).to.be.rejectedWith(
        /invalid session id|session is either terminated or not started/i,
      );
    });

    expect((await secondDriver.$$('XCUIElementTypeWindow')).length).to.be.at.least(1);
    expect(extractCapabilityValue(baseCaps, 'appium:udid')).to.equal(udid);

    const appiumLog = await readAppiumLog();
    expect(appiumLog, 'APPIUM_LOG_PATH must point to a readable log file').to.be.a('string');
    assertSessionClaimIpcTraces(appiumLog!);
  });
});
