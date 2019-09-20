import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { MULTIPLE_APPS } from '../desired';
import { translateDeviceName } from '../../../lib/utils';

chai.should();
chai.use(chaiAsPromised);

describe('OtherApps', function () {
  this.timeout(MOCHA_TIMEOUT);

  let caps;

  let driver;
  before(function () {
    caps = Object.assign({
      usePrebuiltWDA: true,
      wdaStartupRetries: 0,
    }, MULTIPLE_APPS);
    caps.deviceName = translateDeviceName(caps.platformVersion, caps.deviceName);
  });

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    await deleteSession();
  });

  if (!process.env.REAL_DEVICE) {
    it('should start and stop a session', async function () {
      driver = await initSession(caps);
      (await driver.isAppInstalled('io.appium.TestApp')).should.equal(true);
      (await driver.isAppInstalled('com.example.apple-samplecode.UICatalog')).should.equal(true);
    });
  }
});
