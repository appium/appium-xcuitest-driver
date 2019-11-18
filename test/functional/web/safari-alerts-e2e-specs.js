import _ from 'lodash';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { retryInterval } from 'asyncbox';
import { SAFARI_CAPS, PLATFORM_VERSION } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import { GUINEA_PIG_PAGE } from './helpers';


chai.should();
chai.use(chaiAsPromised);

describe('safari - alerts', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async function () {
    // TODO: why does this not work for 9.3? Argh.
    if (PLATFORM_VERSION === '9.3') {
      return this.skip();
    }
    // TODO: why does this fail on Travis? popup happens but button is "send"
    if (process.env.CI) {
      return this.skip();
    }

    let caps = _.defaults({
      safariInitialUrl: GUINEA_PIG_PAGE,
      safariAllowPopups: true,
      nativeWebTap: true,
    }, SAFARI_CAPS);
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

  it('should accept alert', async function () {
    let el = await driver.elementById('alert1');
    await el.click();
    await acceptAlert(driver);
    (await driver.title()).should.include('I am a page title');
  });

  it('should dismiss alert', async function () {
    let el = await driver.elementById('alert1');
    await el.click();
    await dismissAlert(driver);
    (await driver.title()).should.include('I am a page title');
  });

  it('should get text of alert', async function () {
    let el = await driver.elementById('alert1');
    await el.click();
    (await driver.alertText()).should.include('I am an alert');
    await dismissAlert(driver);
  });
  it('should not get text of alert that closed', async function () {
    let el = await driver.elementById('alert1');
    await el.click();
    await acceptAlert(driver);
    await driver.alertText()
      .should.be.rejectedWith(/An attempt was made to operate on a modal dialog when one was not open/);
  });
  it('should set text of prompt', async function () {
    let el = await driver.elementById('prompt1');
    await el.click();
    await driver.alertKeys('of course!');
    await acceptAlert(driver);

    el = await driver.elementById('promptVal');
    (await el.getAttribute('value')).should.eql('of course!');
  });
  it('should fail to set text of alert', async function () {
    let el = await driver.elementById('alert1');
    await el.click();
    await driver.alertKeys('yes I do!')
      .should.be.rejectedWith(/Tried to set text of an alert that was not a prompt/);
  });
});
