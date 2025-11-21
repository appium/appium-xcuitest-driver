import {MOCHA_TIMEOUT, initSession, deleteSession} from '../helpers/session';
import {getMultipleApps, amendCapabilities} from '../desired';
import {UICATALOG_BUNDLE_ID, TESTAPP_BUNDLE_ID} from '../../setup.js';


describe('OtherApps', function () {
  this.timeout(MOCHA_TIMEOUT);

  let caps;

  let driver;
  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    const multipleApps = await getMultipleApps();
    caps = amendCapabilities(multipleApps, {
      'appium:wdaStartupRetries': 0,
    });
  });

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    await deleteSession();
  });

  it('should start and stop a session', async function () {
    driver = await initSession(caps);
    await driver.isAppInstalled(TESTAPP_BUNDLE_ID).should.eventually.be.equal(true);
    await driver
      .isAppInstalled(UICATALOG_BUNDLE_ID)
      .should.eventually.be.equal(true);
  });
});
