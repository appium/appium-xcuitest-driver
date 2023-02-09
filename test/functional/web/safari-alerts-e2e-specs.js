import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { retryInterval } from 'asyncbox';
import { SAFARI_CAPS, amendCapabilities } from '../desired';
import { initSession, deleteSession, hasDefaultPrebuiltWDA, MOCHA_TIMEOUT } from '../helpers/session';
import { GUINEA_PIG_PAGE } from './helpers';


chai.should();
chai.use(chaiAsPromised);

describe('safari - alerts', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async function () {
    const caps = amendCapabilities(SAFARI_CAPS, {
      'appium:safariInitialUrl': GUINEA_PIG_PAGE,
      'appium:safariAllowPopups': true,
      'appium:usePrebuiltWDA': hasDefaultPrebuiltWDA(),
    });
    driver = await initSession(caps);
  });
  after(async function () {
    await deleteSession();
  });

  async function acceptAlert (driver) {
    await retryInterval(5, 500, driver.acceptAlert.bind(driver));
  }

  async function dismissAlert (driver) {
    await retryInterval(5, 500, driver.dismissAlert.bind(driver));
  }

  // All tests below are skipped until https://github.com/appium/appium/issues/17013 is resolved

  it.skip('should accept alert', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    await acceptAlert(driver);
    (await driver.getTitle()).should.include('I am a page title');
  });

  it.skip('should dismiss alert', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    await dismissAlert(driver);
    (await driver.getTitle()).should.include('I am a page title');
  });

  it.skip('should get text of alert', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    (await driver.getAlertText()).should.include('I am an alert');
    await dismissAlert(driver);
  });
  it.skip('should not get text of alert that closed', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    await acceptAlert(driver);
    await driver.getAlertText()
      .should.be.rejectedWith(/An attempt was made to operate on a modal dialog when one was not open/);
  });
  it.skip('should set text of prompt', async function () {
    const alert = await driver.$('#prompt1');
    await alert.click();
    await driver.sendAlertText('of course!');
    await acceptAlert(driver);

    const el = await driver.$('#promptVal');
    (await el.getAttribute('value')).should.eql('of course!');
  });
  it.skip('should fail to set text of alert', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    await driver.sendAlertText('yes I do!')
      .should.be.rejectedWith(/no input fields/);
  });
});
