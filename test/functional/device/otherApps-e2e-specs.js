import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { MULTIPLE_APPS } from '../desired';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver', function () {
  this.timeout(MOCHA_TIMEOUT);

  let caps;

  let driver;
  before(function () {
    caps = Object.assign({
      usePrebuiltWDA: true,
      wdaStartupRetries: 0,
    }, MULTIPLE_APPS);
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
