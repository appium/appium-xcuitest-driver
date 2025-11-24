import B from 'bluebird';
import {retryInterval} from 'asyncbox';
import {getUICatalogCaps} from '../desired';
import {PREDICATE_SEARCH} from '../helpers/element';
import {initSession, deleteSession, MOCHA_TIMEOUT} from '../helpers/session';
import {APPIUM_IMAGE} from '../web/helpers';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

const BTN_OK_CNCL = 'Okay / Cancel';

describe('XCUITestDriver - gestures', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  describe('dynamic gestures', function () {
    before(async function () {
      const uiCatalogCaps = await getUICatalogCaps();
      driver = await initSession(uiCatalogCaps);
    });
    beforeEach(async function () {
      await driver.back();
      await retryInterval(5, 500, async function () {
        const el = await driver.$('~Alert Views');
        await driver.execute('mobile: scroll', {element: el, toVisible: true});
      });
    });
    after(async function () {
      await deleteSession();
    });
    afterEach(async function () {
      // wait a moment to allow anything to happen
      await B.delay(500);
    });

    describe('tap, press, longpress', function () {
      beforeEach(async function () {
        const el = await driver.$('~Alert Views');
        await el.click();
        const btn = await driver.$(`~${BTN_OK_CNCL}`);
        await btn.waitForExist({timeout: 500});
      });

      async function exitModal(name: string) {
        // should exist, will throw error if it doesn't
        const els = await driver.$(`~${name}`);
        await expect(els.isExisting()).to.eventually.be.equal(true);

        await retryInterval(5, 100, async () => {
          const el = await driver.$(`~${name}`);
          await el.click();
        });
      }

      describe('using action', function () {
        it('should tap on the element with action', async function () {
          const el = await driver.$(`~${BTN_OK_CNCL}`);
          await driver.action('pointer').move({origin: el}).down().pause(100).up().perform();
          await exitModal('OK');
        });
        it('should tap on arbitrary coordinates with action', async function () {
          const el = await driver.$(`~${BTN_OK_CNCL}`);
          const loc = await el.getLocation();
          const size = await el.getSize();

          await driver
            .action('pointer')
            .move(loc.x + size.width / 2, loc.y + size.height / 2)
            .down()
            .pause(100)
            .up()
            .perform();

          await exitModal('OK');
        });
      });
    });
    // TODO: Need a scrollable screen.
    it.skip('should scroll using actions', async function () {
      const el1 = await driver.$('~Activity Indicators');
      const loc1 = await el1.getLocation();
      const size1 = await el1.getSize();
      const el2 = await driver.$('~Progress Views');
      const loc2 = await el2.getLocation();
      const size2 = await el2.getSize();

      const el3 = await driver.$('~Web View');
      await expect(el3.isDisplayed()).to.eventually.be.false;

      await driver
        .action('pointer')
        .move(loc1.x + size1.width / 2, loc1.y + size1.height / 2)
        .down()
        .pause(500)
        .move(loc2.x + size2.width / 2, loc2.y + size2.height / 2)
        .up()
        .perform();

      await retryInterval(5, 1000, async function () {
        await expect(el3.isDisplayed()).to.eventually.be.equal(true);
      });
    });
    it('should double tap on an element', async function () {
      await driver.execute('mobile: scroll', {direction: 'down'});
      const steppers = await driver.$('~Steppers');
      await steppers.click();

      await B.delay(1000);
      const stepper = await driver.$('~Increment');
      await driver.action('pointer').move({origin: stepper}).down().pause(500).up().perform();
      await driver.action('pointer').move({origin: stepper}).down().pause(500).up().perform();

      await B.delay(1000);
      const num = await driver.$('~2');
      await expect(num.isExisting()).to.eventually.be.true;
    });
    // TODO: Need a scrollable screen.
    it.skip(`should swipe the table and the bottom cell's Y position should change accordingly`, async function () {
      const winEl = await driver.$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeWindow'`);

      const pickerEl = await driver.$('~Picker View');
      const loc = await pickerEl.getLocation();

      await expect(driver.execute('mobile: swipe', {element: winEl, direction: 'up'})).to.not.be
        .rejected;
      const locMiddle = await pickerEl.getLocation();
      expect(locMiddle.y).to.be.below(loc.y);

      await expect(driver.execute('mobile: swipe', {element: winEl, direction: 'down'})).to.not.be
        .rejected;
      const locFinal = await pickerEl.getLocation();
      expect(locFinal.y).to.be.above(locMiddle.y);
    });
    describe('pinch and zoom', function () {
      beforeEach(async function () {
        await driver.execute('mobile: scroll', {direction: 'down'});
        const el = await driver.$('~Web View');
        await el.click();
      });

      // at this point this test relies on watching it happen, nothing is asserted
      // in automation, this just checks that errors aren't thrown
      it('should be able to pinch', async function () {
        const ctxs = await driver.execute('mobile: getContexts', {waitForWebviewMs: 1000});
        await driver.switchContext(ctxs[1].id);

        await driver.url(APPIUM_IMAGE);

        await driver.switchContext(ctxs[0].id);

        async function doZoom() {
          const el = await driver.$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeApplication'`);
          const thumb = driver
            .action('pointer')
            .move({origin: el, x: 100, y: 0})
            .down()
            .pause(100)
            .move({origin: el, x: 50, y: 0})
            .up();
          const foreFinger = driver
            .action('pointer')
            .move({origin: el, x: 100, y: 0})
            .down()
            .pause(100)
            .move({origin: el, x: 105, y: 0})
            .up();

          await driver.actions([thumb, foreFinger]);
        }
        await doZoom();

        async function doPinch() {
          const el = await driver.$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeApplication'`);
          const thumb = driver
            .action('pointer')
            .move({origin: el, x: 50, y: 0})
            .down()
            .pause(100)
            .move({origin: el, x: 100, y: 0})
            .up();
          const foreFinger = driver
            .action('pointer')
            .move({origin: el, x: 100, y: 0})
            .down()
            .pause(100)
            .move({origin: el, x: 50, y: 0})
            .up();

          await driver.actions([thumb, foreFinger]);
        }
        await doPinch();
      });
    });
  });
});

