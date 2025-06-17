import {retryInterval} from 'asyncbox';
import {
  SAFARI_CAPS,
  amendCapabilities,
  isIosVersionBelow
} from '../desired';
import {initSession, deleteSession, hasDefaultPrebuiltWDA, MOCHA_TIMEOUT} from '../helpers/session';
import {GUINEA_PIG_PAGE} from './helpers';


describe('safari - alerts', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    const caps = amendCapabilities(SAFARI_CAPS, {
      'appium:safariInitialUrl': GUINEA_PIG_PAGE,
      'appium:safariAllowPopups': true,
      'appium:usePrebuiltWDA': hasDefaultPrebuiltWDA(),
    });

    if (process.env.CI && isIosVersionBelow('18.0')) {
      this.skip();
    };

    driver = await initSession(caps);
  });
  after(async function () {
    await deleteSession();
  });

  async function acceptAlert(driver) {
    await retryInterval(5, 500, driver.acceptAlert.bind(driver));
  }

  async function dismissAlert(driver) {
    await retryInterval(5, 500, driver.dismissAlert.bind(driver));
  }

  it('should accept alert', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    await acceptAlert(driver);
    (await driver.getTitle()).should.include('I am a page title');
  });

  it('should dismiss alert', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    await dismissAlert(driver);
    (await driver.getTitle()).should.include('I am a page title');
  });

  it('should get text of alert', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    (await driver.getAlertText()).should.include('I am an alert');
    await dismissAlert(driver);
  });
  it('should not get text of alert that closed', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    await acceptAlert(driver);
    await driver
      .getAlertText()
      .should.be.rejectedWith(
        /An attempt was made to operate on a modal dialog when one was not open/,
      );
  });
  it('should set text of prompt', async function () {
    const alert = await driver.$('#prompt1');
    await alert.click();
    await driver.sendAlertText('of course!');
    await acceptAlert(driver);

    const el = await driver.$('#promptVal');
    (await el.getAttribute('value')).should.eql('of course!');
  });
  it('should fail to set text of alert', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    await driver.sendAlertText('yes I do!').should.be.rejectedWith(/no input fields/);
    await acceptAlert(driver);
  });
});
