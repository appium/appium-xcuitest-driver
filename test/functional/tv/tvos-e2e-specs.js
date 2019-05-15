import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { retryInterval } from 'asyncbox';
import { getSimulator } from 'appium-ios-simulator';
import { shutdownSimulator } from '../helpers/simulator';
import { createDevice, deleteDevice } from 'node-simctl';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { TVOS_CAPS } from '../desired';

const SIM_DEVICE_NAME = 'xcuitestDriverTest';

chai.should();
chai.use(chaiAsPromised);

async function deleteDeviceWithRetry (udid) {
  try {
    await retryInterval(10, 1000, deleteDevice, udid);
  } catch (ign) {}
}

describe('tvOS', function () {
  this.timeout(MOCHA_TIMEOUT);

  let baseCaps;
  let caps;
  before(async function () {
    const udid = await createDevice(
      SIM_DEVICE_NAME,
      TVOS_CAPS.deviceName,
      TVOS_CAPS.platformVersion,
      { platform: 'tvOS' });
    baseCaps = Object.assign({}, TVOS_CAPS, {udid});
    caps = Object.assign({usePrebuiltWDA: true}, baseCaps);
  });
  after(async function () {
    const sim = await getSimulator(caps.udid);
    await shutdownSimulator(sim);
    await deleteDeviceWithRetry(caps.udid);
  });

  afterEach(async function () {
    await deleteSession();
  });

  it('should launch com.apple.TVSetting', async function () {
    const driver = await initSession(baseCaps);
    (await driver.elementByAccessibilityId('General')).should.exist;
  });
});
