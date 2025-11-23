import {MOCHA_TIMEOUT, initSession, deleteSession} from '../helpers/session';
import {getMultipleApps, amendCapabilities} from '../desired';
import {UICATALOG_BUNDLE_ID, TESTAPP_BUNDLE_ID} from '../../setup';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('OtherApps', function () {
  this.timeout(MOCHA_TIMEOUT);

  let caps;

  let driver;

  before(async function () {
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
    await expect(driver.isAppInstalled(TESTAPP_BUNDLE_ID)).to.eventually.be.equal(true);
    await expect(driver.isAppInstalled(UICATALOG_BUNDLE_ID)).to.eventually.be.equal(true);
  });
});

