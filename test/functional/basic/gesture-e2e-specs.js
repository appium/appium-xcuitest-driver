import B from 'bluebird';
import {retryInterval} from 'asyncbox';
import {UICATALOG_CAPS} from '../desired';
import {PREDICATE_SEARCH} from '../helpers/element';
import {initSession, deleteSession, MOCHA_TIMEOUT} from '../helpers/session';
import {APPIUM_IMAGE} from '../web/helpers';


const BTN_OK_CNCL = 'Okay / Cancel';

describe('XCUITestDriver - gestures', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);
  });

  describe('dynamic gestures', function () {
    before(async function () {
      driver = await initSession(UICATALOG_CAPS);
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

      async function exitModal(name) {
        // should exist, will throw error if it doesn't
        const els = await driver.$(`~${name}`);
        await els.isExisting().should.eventually.be.equal(true);

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
      await el3.isDisplayed().should.eventually.be.false;

      await driver
        .action('pointer')
        .move(loc1.x + size1.width / 2, loc1.y + size1.height / 2)
        .down()
        .pause(500)
        .move(loc2.x + size2.width / 2, loc2.y + size2.height / 2)
        .up()
        .perform();

      await retryInterval(5, 1000, async function () {
        await el3.isDisplayed().should.eventually.be.equal(true);
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
      await num.isExisting().should.eventually.be.true;
    });
    // TODO: Need a scrollable screen.
    it.skip(`should swipe the table and the bottom cell's Y position should change accordingly`, async function () {
      const winEl = await driver.$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeWindow'`);

      const pickerEl = await driver.$('~Picker View');
      const loc = await pickerEl.getLocation();

      await driver.execute('mobile: swipe', {element: winEl, direction: 'up'}).should.not.be
        .rejected;
      const locMiddle = await pickerEl.getLocation();
      locMiddle.y.should.be.below(loc.y);

      await driver.execute('mobile: swipe', {element: winEl, direction: 'down'}).should.not.be
        .rejected;
      const locFinal = await pickerEl.getLocation();
      locFinal.y.should.be.above(locMiddle.y);
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
