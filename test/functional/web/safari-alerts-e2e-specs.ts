import {retryInterval} from 'asyncbox';
import {
  SAFARI_CAPS,
  amendCapabilities,
  isIosVersionBelow
} from '../desired';
import {initSession, deleteSession, MOCHA_TIMEOUT} from '../helpers/session';
import {GUINEA_PIG_PAGE} from './helpers';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('safari - alerts', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  before(async function () {
    const caps = amendCapabilities(SAFARI_CAPS, {
      'appium:safariInitialUrl': GUINEA_PIG_PAGE,
      'appium:safariAllowPopups': true,
    });

    if (process.env.CI && isIosVersionBelow('18.0')) {
      this.skip();
    };

    driver = await initSession(caps);
  });
  after(async function () {
    await deleteSession();
  });

  async function acceptAlert(driver: any) {
    await retryInterval(5, 500, driver.acceptAlert.bind(driver));
  }

  async function dismissAlert(driver: any) {
    await retryInterval(5, 500, driver.dismissAlert.bind(driver));
  }

  it('should accept alert', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    await acceptAlert(driver);
    expect(await driver.getTitle()).to.include('I am a page title');
  });

  it('should dismiss alert', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    await dismissAlert(driver);
    expect(await driver.getTitle()).to.include('I am a page title');
  });

  it('should get text of alert', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    expect(await driver.getAlertText()).to.include('I am an alert');
    await dismissAlert(driver);
  });
  it('should not get text of alert that closed', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    await acceptAlert(driver);
    await expect(driver
      .getAlertText()
    ).to.be.rejectedWith(
      /An attempt was made to operate on a modal dialog when one was not open/,
    );
  });
  it('should set text of prompt', async function () {
    const alert = await driver.$('#prompt1');
    await alert.click();
    await driver.sendAlertText('of course!');
    await acceptAlert(driver);

    const el = await driver.$('#promptVal');
    expect(await el.getAttribute('value')).to.eql('of course!');
  });
  it('should fail to set text of alert', async function () {
    const alert = await driver.$('#alert1');
    await alert.click();
    await expect(driver.sendAlertText('yes I do!')).to.be.rejectedWith(/no input fields/);
    await acceptAlert(driver);
  });
});

