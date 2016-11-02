import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import wd from 'wd';
import _ from 'lodash';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - gestures', function () {
  this.timeout(200 * 1000);

  let driver;

  describe('dynamic gestures', () => {
    before(async () => {
      driver = await initSession(UICATALOG_CAPS);
    });
    after(async () => {
      await deleteSession();
    });
    afterEach(async () => {
      // wait a moment to allow anything to happen
      await B.delay(1000);
      await driver.back();
    });

    describe('tap, press, longpress', () => {
      beforeEach(async () => {
        let el = await driver.elementByAccessibilityId('Action Sheets');
        await el.click();
      });
      it('should tap on the element', async () => {
        let el1 = await driver.elementByAccessibilityId('Okay / Cancel');
        let action = new wd.TouchAction(driver);
        action.tap({el: el1});
        await action.perform();

        let el3 = await driver.elementByAccessibilityId('OK');
        await el3.click();
      });
      it('should long press on an element', async () => {
        let el1 = await driver.elementByAccessibilityId('Okay / Cancel');
        let action = new wd.TouchAction(driver);
        action.longPress({el: el1});
        await action.perform();

        let el3 = await driver.elementByAccessibilityId('Cancel');
        await el3.click();
      });
      it('should long press on an element with duration through press-wait-release', async () => {
        let el1 = await driver.elementByAccessibilityId('Okay / Cancel');
        let action = new wd.TouchAction(driver);
        action.press({el: el1}).wait(1200).release();
        await action.perform();

        let el3 = await driver.elementByAccessibilityId('Cancel');
        await el3.click();
      });
    });
    it('should scroll using touch actions', async function () {
      // TODO: investigate why this fails in Travis
      //   it seems to go into the "Page Control" view before trying to scroll?
      if (process.env.TRAVIS) this.skip();
      let el1 = await driver.elementByAccessibilityId('Action Sheets');
      let el2 = await driver.elementByAccessibilityId('Text Fields');

      let action = new wd.TouchAction(driver);
      action.press({el: el1}).moveTo({el: el2}).release();
      await action.perform();

      let el3 = await driver.elementByAccessibilityId('Text Fields');
      await el3.click().should.not.be.rejected;
    });
  });
  describe('tap with tapWithShortPressDuration cap', () => {
    // needs a special cap, so has to be in its own session
    before(async () => {
      driver = await initSession(_.defaults({
        tapWithShortPressDuration: 0.01
      }, UICATALOG_CAPS));
    });
    after(async () => {
      await deleteSession();
    });

    it('should tap on the element', async () => {
      let el1 = await driver.elementByAccessibilityId('Action Sheets');
      let action = new wd.TouchAction(driver);
      action.tap({el: el1});
      action.perform();

      // pause a moment so the alert can animate
      await B.delay(500);

      let el2 = await driver.elementByAccessibilityId('Okay / Cancel');
      el2.should.exist;
    });
  });
});
