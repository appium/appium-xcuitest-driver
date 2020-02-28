import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import { retryInterval } from 'asyncbox';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - alerts -', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async function () {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(async function () {
    await deleteSession();
  });


  beforeEach(async function () {
    await retryInterval(5, 500, async () => {
      let el = await driver.elementByAccessibilityId('Alert Views');
      await el.click();

      (await driver.elementsByAccessibilityId('Simple')).should.have.length(1);
    });
  });
  afterEach(async function () {
    try {
      await driver.dismissAlert();
    } catch (ign) {}
    await driver.back();
  });

  it('should detect Simple', async function () {
    let el = await driver.elementByAccessibilityId('Simple');
    await el.click();
    await B.delay(process.env.CLOUD ? 10000 : 2000);

    (await driver.alertText()).should.include('A Short Title Is Best');
    await driver.dismissAlert();
  });

  it('should detect Okay', async function () {
    let el = await driver.elementByAccessibilityId('Okay / Cancel');
    await el.click();

    // small pause for alert to open
    await B.delay(1000);

    (await driver.alertText()).should.include('A Short Title Is Best');
    await driver.acceptAlert();
  });

  it('should detect Other', async function () {
    let el = await driver.elementByAccessibilityId('Other');
    await el.click();

    // small pause for alert to open
    await B.delay(1000);

    (await driver.alertText()).should.include('A Short Title Is Best');
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
        expectedText: '•••••••••••'
      }
    ];
    for (const test of testData) {
      it(`should be able to interact with a prompt with a ${test.name}`, async function () {
        let el = await driver.elementByAccessibilityId(test.alert);
        await el.click();

        // small pause for alert to open
        await B.delay(1000);

        await driver.alertKeys(test.text);

        let textField = await driver.elementByClassName(test.field);
        let text = await textField.text();
        text.should.equal(test.expectedText);

        // on some devices the keyboard obscurs the buttons so no dismiss is possible
        await textField.type('\n');
      });
    }
  });

  it('should throw a NoAlertOpenError when no alert is open', async function () {
    await driver.acceptAlert()
      .should.eventually.be.rejectedWith(/An attempt was made to operate on a modal dialog when one was not open/);
  });
});
