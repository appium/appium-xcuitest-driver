import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import wd from 'wd';
import { UICATALOG_CAPS } from './desired';
import { clickButton } from './helpers/navigation';
import { initSession, deleteSession } from './helpers/session';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - gestures', function () {
  this.timeout(200 * 1000);

  let driver;
  before(async () => {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(deleteSession);

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
