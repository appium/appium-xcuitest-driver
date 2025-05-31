import {getSimulator} from 'appium-ios-simulator';
import {cleanupSimulator} from '../helpers/simulator';
import {Simctl} from 'node-simctl';
import {MOCHA_TIMEOUT, initSession, deleteSession} from '../helpers/session';
import {TVOS_CAPS} from '../desired';

const SIM_DEVICE_NAME = 'xcuitestDriverTest';


const simctl = new Simctl();

describe('tvOS', function () {
  this.timeout(MOCHA_TIMEOUT);

  let baseCaps;
  let udid;
  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    udid = await simctl.createDevice(
      SIM_DEVICE_NAME,
      TVOS_CAPS.deviceName,
      TVOS_CAPS.platformVersion,
      {platform: TVOS_CAPS.platformName},
    );
  });

  after(async function () {
    if (udid) {
      const sim = await getSimulator(udid, {
        platform: TVOS_CAPS.platformName,
        checkExistence: false,
      });
      await cleanupSimulator(sim);
    }
  });

  beforeEach(function () {
    baseCaps = {...TVOS_CAPS, udid};
  });

  afterEach(async function () {
    await deleteSession();
  });

  it('should launch com.apple.TVSettings', async function () {
    baseCaps.autoLaunch = true;
    const driver = await initSession(baseCaps);
    // @ts-expect-error does this exist? I guess it does?
    (await driver.elementByAccessibilityId('General')).should.exist;
  });

  it('should launch com.apple.TVSettings with autoLaunch false', async function () {
    baseCaps.autoLaunch = false;
    const driver = await initSession(baseCaps);
    await driver.execute('mobile: activateApp', {bundleId: 'com.apple.TVSettings'});
    // @ts-expect-error does this exist? I guess it does?
    (await driver.elementByAccessibilityId('General')).should.exist;
  });
});
