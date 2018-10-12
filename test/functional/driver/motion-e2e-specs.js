import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { getSimulator } from 'appium-ios-simulator';
import { shutdownSimulator } from '../helpers/simulator';
import { createDevice, deleteDevice } from 'node-simctl';
import { retryInterval } from 'asyncbox';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { SETTINGS_CAPS } from '../desired';

const SIM_DEVICE_NAME = 'xcuitestDriverMotionTest';
const PREDICATE_SEARCH = '-ios predicate string';

chai.should();
chai.use(chaiAsPromised);

const deleteDeviceWithRetry = async function (udid) {
  try {
    await retryInterval(10, 1000, deleteDevice, udid);
  } catch (ign) {}
};

describe('ReduceMotion', function () {
  this.timeout(MOCHA_TIMEOUT);

  let baseCaps;
  let caps;

  let driver;
  before(async function () {
    const udid = await createDevice(SIM_DEVICE_NAME,
            SETTINGS_CAPS.deviceName, SETTINGS_CAPS.platformVersion);
    baseCaps = Object.assign({}, SETTINGS_CAPS, {udid});
    caps = Object.assign({usePrebuiltWDA: true, reduceMotion: true}, baseCaps);
  });

  after(async function () {
    const sim = await getSimulator(caps.udid);
    await shutdownSimulator(sim);
    await deleteDeviceWithRetry(caps.udid);
  });

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    await deleteSession();
    const sim = await getSimulator(caps.udid);
    await shutdownSimulator(sim);
  });

  async function getReduceMotion (driver) {
    let el = await driver.element(PREDICATE_SEARCH, "type == 'XCUIElementTypeCell' AND name == 'General'");
    await el.click();
    el = await driver.element(PREDICATE_SEARCH, "type == 'XCUIElementTypeCell' AND name == 'Accessibility'");
    await el.click();
    el = await driver.element(PREDICATE_SEARCH, "type == 'XCUIElementTypeCell' AND name == 'Reduce Motion'");
    await el.click();
    el = await driver.element(PREDICATE_SEARCH, "type == 'XCUIElementTypeSwitch' AND name == 'Reduce Motion'");
    return await el.getAttribute('value');
  }

  if (!process.env.REAL_DEVICE) {
    it('should enable reduce motion', async function () {
      driver = await initSession(caps);
      (await getReduceMotion(driver)).should.eql('1');
    });
    it('should disable reduce motion', async function () {
      caps.reduceMotion = false;
      driver = await initSession(caps);
      (await getReduceMotion(driver)).should.eql('0');
    });
  }
});
