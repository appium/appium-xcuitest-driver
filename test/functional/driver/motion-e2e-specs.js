import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { getSimulator } from 'appium-ios-simulator';
import { shutdownSimulator } from '../helpers/simulator';
import { createDevice, deleteDevice } from 'node-simctl';
import { retryInterval } from 'asyncbox';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { SETTINGS_CAPS } from '../desired';

const SIM_DEVICE_NAME = 'xcuitestDriverMotionTest';

const should = chai.should(); // eslint-disable-line no-unused-vars
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
    caps = Object.assign({usePrebuiltWDA: true, "reduceMotion": true}, baseCaps);
  });

  after(async function () {
    const sim = await getSimulator(caps.udid);
    await shutdownSimulator(sim);
    await deleteDeviceWithRetry(caps.udid);
  });

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    const sim = await getSimulator(caps.udid);
    await shutdownSimulator(sim);
    await deleteSession();
  });

  if (!process.env.REAL_DEVICE) {
    it('should enable reduce motion', async function () {
      driver = await initSession(caps);
      let el = await driver.elementsByXPath('//XCUIElementTypeCell[@name="General"]');
      await el[0].click();
      el = await driver.elementsByXPath('//XCUIElementTypeCell[@name="Accessibility"]');
      await el[0].click();
      el = await driver.elementsByXPath('//XCUIElementTypeCell[@name="Reduce Motion"]');
      await el[0].click();
      el = await driver.elementsByXPath('//XCUIElementTypeSwitch[@name="Reduce Motion"]');
      (await el[0].getAttribute('value')).should.eql('1');
    });
    it('should disable reduce motion', async function () {
      caps.reduceMotion = false;
      driver = await initSession(caps);
      let el = await driver.elementsByXPath('//XCUIElementTypeCell[@name="General"]');
      await el[0].click();
      el = await driver.elementsByXPath('//XCUIElementTypeCell[@name="Accessibility"]');
      await el[0].click();
      el = await driver.elementsByXPath('//XCUIElementTypeCell[@name="Reduce Motion"]');
      await el[0].click();
      el = await driver.elementsByXPath('//XCUIElementTypeSwitch[@name="Reduce Motion"]');
      (await el[0].getAttribute('value')).should.eql('0');
    });
  }
});