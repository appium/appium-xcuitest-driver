import B from 'bluebird';
import {retryInterval} from 'asyncbox';
import {getUICatalogCaps} from '../desired';
import {initSession, deleteSession, MOCHA_TIMEOUT} from '../helpers/session';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('XCUITestDriver - alerts -', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  before(async function () {
    const uiCatalogCaps = await getUICatalogCaps();
    driver = await initSession(uiCatalogCaps);
  });
  after(async function () {
    await deleteSession();
  });

  beforeEach(async function () {
    await retryInterval(5, 500, async () => {
      const el = await driver.$('~Alert Views');
      await el.click();

      expect(await driver.$$('~Simple')).to.have.length(1);
    });
  });
  afterEach(async function () {
    try {
      await driver.dismissAlert();
    } catch {}
    await driver.back();
  });

  it('should detect Simple', async function () {
    const el = await driver.$('~Simple');
    await el.click();
    await B.delay(2000);

    expect(await driver.getAlertText()).to.include('A Short Title Is Best');
    await driver.dismissAlert();
  });

  it('should detect Okay', async function () {
    const el = await driver.$('~Okay / Cancel');
    await el.click();

    // small pause for alert to open
    await B.delay(1000);

    expect(await driver.getAlertText()).to.include('A Short Title Is Best');
    await driver.acceptAlert();
  });

  it('should detect Other', async function () {
    const el = await driver.$('~Other');
    await el.click();

    // small pause for alert to open
    await B.delay(1000);

    expect(await driver.getAlertText()).to.include('A Short Title Is Best');
    await driver.dismissAlert();
  });

  describe('prompt -', function () {
    const testData = [
      {
        name: 'text field',
        alert: 'Text Entry',
        field: 'XCUIElementTypeTextField',
        text: 'hello world',
        expectedText: 'hello world',
      },
      {
        name: 'secure text field',
        alert: 'Secure Text Entry',
        field: 'XCUIElementTypeSecureTextField',
        text: 'hello world',
        expectedText: '•••••••••••',
      },
    ];
    for (const test of testData) {
      it(`should be able to interact with a prompt with a ${test.name}`, async function () {
        const el = await driver.$(`~${test.alert}`);
        await el.click();

        // small pause for alert to open
        await B.delay(1000);

        await driver.sendAlertText(test.text);

        const textField = await driver.$(test.field);
        const text = await textField.getText();
        expect(text).to.equal(test.expectedText);

        // on some devices the keyboard obscurs the buttons so no dismiss is possible
        await textField.setValue('\n');
      });
    }
  });

  it('should throw a NoAlertOpenError when no alert is open', async function () {
    await expect(driver.acceptAlert()).to.be.rejectedWith(
      /An attempt was made to operate on a modal dialog when one was not open/,
    );
  });
});

