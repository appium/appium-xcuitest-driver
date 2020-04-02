import _ from 'lodash';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { retryInterval } from 'asyncbox';
import { SAFARI_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import { GUINEA_PIG_PAGE } from './helpers';


chai.should();
chai.use(chaiAsPromised);

describe('safari - alerts', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async function () {
    const caps = _.defaults({
      safariInitialUrl: GUINEA_PIG_PAGE,
      safariAllowPopups: true,
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
    await driver.elementById('alert1').click();
    await acceptAlert(driver);
    (await driver.title()).should.include('I am a page title');
  });

  it('should dismiss alert', async function () {
    await driver.elementById('alert1').click();
    await dismissAlert(driver);
    (await driver.title()).should.include('I am a page title');
  });

  it('should get text of alert', async function () {
    await driver.elementById('alert1').click();
    (await driver.alertText()).should.include('I am an alert');
    await dismissAlert(driver);
  });
  it('should not get text of alert that closed', async function () {
    await driver.elementById('alert1').click();
    await acceptAlert(driver);
    await driver.alertText()
      .should.eventually.be.rejectedWith(/An attempt was made to operate on a modal dialog when one was not open/);
  });
  it('should set text of prompt', async function () {
    await driver.elementById('prompt1').click();
    await driver.alertKeys('of course!');
    await acceptAlert(driver);

    const el = await driver.elementById('promptVal');
    (await el.getAttribute('value')).should.eql('of course!');
  });
  it('should fail to set text of alert', async function () {
    await driver.elementById('alert1').click();
    await driver.alertKeys('yes I do!')
      .should.eventually.be.rejectedWith(/no input fields/);
  });
});
