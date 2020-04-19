import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { getSimulator } from 'appium-ios-simulator';
import { shutdownSimulator, deleteDeviceWithRetry } from '../helpers/simulator';
import Simctl from 'node-simctl';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { TVOS_CAPS } from '../desired';


const SIM_DEVICE_NAME = 'xcuitestDriverTest';

chai.should();
chai.use(chaiAsPromised);

const simctl = new Simctl();

describe('tvOS', function () {
  this.timeout(MOCHA_TIMEOUT);

  let baseCaps;
  let caps;
  let udid;
  before(async function () {
    udid = await simctl.createDevice(
      SIM_DEVICE_NAME,
      TVOS_CAPS.deviceName,
      TVOS_CAPS.platformVersion,
      { platform: 'tvOS' });
  });

  after(async function () {
    const sim = await getSimulator(caps.udid, {
      platform: 'tvOS',
      checkExistence: false,
    });
    await shutdownSimulator(sim);
    await deleteDeviceWithRetry(caps.udid);
  });

  beforeEach(function () {
    baseCaps = Object.assign({}, TVOS_CAPS, {udid});
    caps = Object.assign({usePrebuiltWDA: true}, baseCaps);
  });

  afterEach(async function () {
    await deleteSession();
  });

  it('should launch com.apple.TVSetting', async function () {
    const driver = await initSession(baseCaps);
    (await driver.elementByAccessibilityId('General')).should.exist;
  });

  it('should launch com.apple.TVSetting with autoLaunch false', async function () {
    baseCaps.autoLaunch = false;
    const driver = await initSession(baseCaps);
    await driver.activateApp('com.apple.TVSetting');
    (await driver.elementByAccessibilityId('General')).should.exist;
  });
});
