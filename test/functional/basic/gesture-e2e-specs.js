import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import wd from 'wd';
import _ from 'lodash';
import { retryInterval } from 'asyncbox';
import { UICATALOG_CAPS, skipIOS11 } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import { APPIUM_IMAGE } from '../web/helpers';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - gestures', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  describe('dynamic gestures', () => {
    before(async () => {
      driver = await initSession(UICATALOG_CAPS);
    });
    beforeEach(async () => {
      await driver.back();
    });
    after(async () => {
      await deleteSession();
    });
    afterEach(async () => {
      // wait a moment to allow anything to happen
      await B.delay(500);
    });

    describe('tap, press, longpress', () => {
      beforeEach(async () => {
        await retryInterval(10, 500, async () => {
          let el = await driver.elementByAccessibilityId('Action Sheets');
          await driver.execute('mobile: scroll', {element: el, toVisible: true});
          await el.click();
        });
      });

      async function exitModal (name) {
        // should exist, will throw error if it doesn't
        let els = await driver.elementsByAccessibilityId(name);
        els.should.have.length(1);

        await retryInterval(5, 100, async () => {
          await els[0].click();

          els = await driver.elementsByAccessibilityId(name);
          els.should.have.length(0);
        });
      }
      describe('tap', () => {
        it('should tap on the element', async () => {
          let el1 = await driver.elementByAccessibilityId('Okay / Cancel');
          let action = new wd.TouchAction(driver);
          action.tap({el: el1});
          await action.perform();

          await exitModal('OK');
        });
        it('should tap on arbitrary coordinates', async function () {
          if (skipIOS11(this)) return; // eslint-disable-line curly

          let el1 = await driver.elementByAccessibilityId('Okay / Cancel');
          let loc = await el1.getLocation();

          let action = new wd.TouchAction(driver);
          action.tap(loc);
          await action.perform();

          await exitModal('OK');
        });
      });
      it('should long press on an element', async () => {
        let el1 = await driver.elementByAccessibilityId('Okay / Cancel');
        let action = new wd.TouchAction(driver);
        action.longPress({el: el1});
        await action.perform();

        await exitModal('Cancel');
      });
      it('should long press on an element with duration through press-wait-release', async () => {
        let el1 = await driver.elementByAccessibilityId('Okay / Cancel');
        let action = new wd.TouchAction(driver);
        action.press({el: el1}).wait(1200).release();
        await action.perform();

        await exitModal('Cancel');
      });
      it('should long press on an element with duration through pressOpts.duration', async () => {
        let el1 = await driver.elementByAccessibilityId('Okay / Cancel');
        let action = new wd.TouchAction(driver);
        action.longPress({el: el1, duration: 1200});
        await action.perform();

        await exitModal('Cancel');
      });
      it('should long press on arbitrary coordinates', async function () {
        if (skipIOS11(this)) return; // eslint-disable-line curly

        let el1 = await driver.elementByAccessibilityId('Okay / Cancel');
        let loc = await el1.getLocation();

        let action = new wd.TouchAction(driver);
        action.press(loc).wait(500).release();
        await action.perform();

        await exitModal('OK');
      });
    });
    it('should scroll using touch actions', async function () {
      let el1 = await driver.elementByAccessibilityId('Action Sheets');
      let el2 = await driver.elementByAccessibilityId('Text Fields');

      let action = new wd.TouchAction(driver);
      action.press({el: el1}).moveTo({el: el2}).release();
      await action.perform();

      let el3 = await driver.elementByAccessibilityId('Text Fields');
      await el3.click().should.not.be.rejected;
    });
    it('should double tap on an element', async () => {
      let el = await driver.elementByAccessibilityId('Steppers');
      await driver.execute('mobile: scroll', {element: el, toVisible: true});
      await el.click();

      let stepper = await driver.elementByAccessibilityId('Increment');
      let action = new wd.TouchAction(driver);
      action.tap({el: stepper, count: 2});
      await action.perform();

      await driver.elementByAccessibilityId('2').should.not.be.rejected;
    });
    it(`should swipe the table and the bottom cell's Y position should change accordingly`, async function () {
      let winEl = await driver.elementByClassName('XCUIElementTypeWindow');
      let pickerEl = await driver.elementByAccessibilityId('Picker View');
      let yInit = (await pickerEl.getLocation()).y;

      await driver.execute('mobile: swipe', {element: winEl, direction: 'up'}).should.not.be.rejected;
      let yMiddle = (await pickerEl.getLocation()).y;
      yMiddle.should.be.below(yInit);

      await driver.execute('mobile: swipe', {element: winEl, direction: 'down'}).should.not.be.rejected;
      let yFinal = (await pickerEl.getLocation()).y;
      yFinal.should.be.above(yMiddle);
    });
    describe('pinch and zoom', () => {
      beforeEach(async () => {
        let el = await driver.elementByAccessibilityId('Web View');
        await driver.execute('mobile: scroll', {element: el, toVisible: true});
        await el.click();
      });

      // at this point this test relies on watching it happen, nothing is asserted
      // in automation, this just checks that errors aren't thrown
      it('should be able to pinch', async () => {
        let ctxs;
        await retryInterval(10, 1000, async () => {
          // on some systems (like Travis) it takes a while to load the webview
          ctxs = await driver.contexts();
          if (ctxs.length === 1) {
            throw new Error('No webview context found');
          }
        });
        await driver.context(ctxs[1]);

        await driver.get(APPIUM_IMAGE);

        await driver.context(ctxs[0]);

        async function doZoom () {
          let el = await driver.elementByClassName('XCUIElementTypeApplication');
          let thumb = new wd.TouchAction(driver);
          thumb.press({el, x: 100, y: 0}).moveTo({el, x: 50, y: 0}).release();

          let foreFinger = new wd.TouchAction(driver);
          foreFinger.press({el, x: 100, y: 0}).moveTo({el, x: 105, y: 0}).release();

          let zoom = new wd.MultiAction(driver);
          zoom.add(thumb, foreFinger);
          await zoom.perform();
        }
        await doZoom();

        async function doPinch () {
          let el = await driver.elementByClassName('XCUIElementTypeApplication');
          let thumb = new wd.TouchAction(driver);
          thumb.press({el, x: 50, y: 0}).moveTo({el, x: 100, y: 0}).release();

          let foreFinger = new wd.TouchAction(driver);
          foreFinger.press({el, x: 100, y: 0}).moveTo({el, x: 50, y: 0}).release();

          let pinch = new wd.MultiAction(driver);
          pinch.add(thumb, foreFinger);
          await pinch.perform();
        }
        await doPinch();
      });
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
