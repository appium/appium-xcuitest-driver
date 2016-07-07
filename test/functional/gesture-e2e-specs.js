import { startServer } from '../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';
import B from 'bluebird';
import { UICATALOG_CAPS } from './desired';


chai.should();
chai.use(chaiAsPromised);

const HOST = "localhost",
      PORT = 4994;

async function clickButton (driver, name) {
  let el = (await driver.elementsByXPath(`//UIAButton[@name = '${name}']`))[0];
  if (el && (await el.isDisplayed())) {
    await el.click();
  }
}

describe('XCUITestDriver - gestures', function () {
  this.timeout(200 * 1000);

  let server, driver;
  before(async () => {
    driver = wd.promiseChainRemote(HOST, PORT);
    server = await startServer(PORT, HOST);
    await driver.init(UICATALOG_CAPS);
  });
  after(async () => {
    await driver.quit();
    await server.close();
  });

  // make sure that elements are mixed up
  describe('tap', () => {
    afterEach(async() => {
      await clickButton(driver, 'UICatalog');
    });

    it('should tap on the element', async () => {
      let el1 = await driver.elementByAccessibilityId('Action Sheets');
      let action = new wd.TouchAction(driver);
      action.tap({el: el1});
      action.perform();

      // pause a moment
      await B.delay(500);

      let el2 = await driver.elementByAccessibilityId('Okay / Cancel');
      el2.should.exist;
    });
  });

});
