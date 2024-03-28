import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {MOCHA_TIMEOUT, initSession, deleteSession, getUsePrebuiltWDACaps} from '../helpers/session';
import {MULTIPLE_APPS, amendCapabilities, UICATALOG_BUNDLE_ID} from '../desired';

chai.should();
chai.use(chaiAsPromised);

describe('OtherApps', function () {
  this.timeout(MOCHA_TIMEOUT);

  let caps;

  let driver;
  before(async function () {
    caps = amendCapabilities(MULTIPLE_APPS, {
      'appium:wdaStartupRetries': 0,
    }, await getUsePrebuiltWDACaps());
  });

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    try {
      await driver.terminateApp(UICATALOG_BUNDLE_ID);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
    await deleteSession();
  });

  it('should start and stop a session', async function () {
    driver = await initSession(caps);
    await driver.isAppInstalled('io.appium.TestApp').should.eventually.be.equal(true);
    await driver
      .isAppInstalled('com.example.apple-samplecode.UICatalog')
      .should.eventually.be.equal(true);
  });
});
