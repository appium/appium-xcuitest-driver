import _ from 'lodash';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
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
  after(async () => {
    await deleteSession();
  });

  it('should accept alert', async () => {
    let el = await driver.elementById('alert1');
    await el.click();
    await driver.acceptAlert();
    (await driver.title()).should.include('I am a page title');
  });

  it('should dismiss alert', async () => {
    let el = await driver.elementById('alert1');
    await el.click();
    await driver.dismissAlert();
    (await driver.title()).should.include('I am a page title');
  });

  it('should get text of alert', async () => {
    let el = await driver.elementById('alert1');
    await el.click();
    (await driver.alertText()).should.include('I am an alert');
    await driver.dismissAlert();
  });
  it('should not get text of alert that closed', async () => {
    let el = await driver.elementById('alert1');
    await el.click();
    await driver.acceptAlert();
    await driver.alertText()
      .should.be.rejectedWith(/An attempt was made to operate on a modal dialog when one was not open/);
  });
  it('should set text of prompt', async () => {
    let el = await driver.elementById('prompt1');
    await el.click();
    await driver.alertKeys('of course!');
    await driver.acceptAlert();

    el = await driver.elementById('promptVal');
    (await el.getAttribute('value')).should.eql('of course!');
  });
  it('should fail to set text of alert', async () => {
    let el = await driver.elementById('alert1');
    await el.click();
    await driver.alertKeys('yes I do!')
      .should.be.rejectedWith(/Tried to set text of an alert that was not a prompt/);
  });
});
