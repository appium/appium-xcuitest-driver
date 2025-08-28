import _ from 'lodash';
import {
  SAFARI_CAPS,
  amendCapabilities,
  isIosVersionBelow
} from '../desired';
import {initSession, deleteSession, MOCHA_TIMEOUT} from '../helpers/session';
import {
  openPage,
  spinTitleEquals,
  GUINEA_PIG_PAGE,
  GUINEA_PIG_FRAME_PAGE,
  GUINEA_PIG_IFRAME_PAGE,
} from './helpers';
import {waitForCondition} from 'asyncbox';


const GET_ELEM_SYNC = `return document.getElementsByTagName('h1')[0].innerHTML;`;
const GET_ELEM_ASYNC = `arguments[arguments.length - 1](document.getElementsByTagName('h1')[0].innerHTML);`;

const FRAMESET_TITLE = 'Frameset guinea pig';
const IFRAME_FRAMESET_TITLE = 'Iframe guinea pig';
const SUB_FRAME_1_TITLE = 'Sub frame 1';
const SUB_FRAME_2_TITLE = 'Sub frame 2';
const SUB_FRAME_3_TITLE = 'Sub frame 3';
const DEFAULT_IMPLICIT_TIMEOUT_MS = 1000;

describe('safari - windows and frames', function () {
  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);
  });

  describe('without safariAllowPopups', function () {
    this.timeout(MOCHA_TIMEOUT);

    let driver;
    before(async function () {
      const caps = amendCapabilities(SAFARI_CAPS, {
        'appium:safariInitialUrl': GUINEA_PIG_PAGE,
        'appium:safariAllowPopups': false,
      });
      driver = await initSession(caps);
      await driver.setTimeout({pageLoad: 100});
    });
    after(async function () {
      await deleteSession();
    });

    it('should not be able to open js popup windows', async function () {
      await driver.executeScript("window.open('/test/guinea-pig2.html', null)", []);
      await spinTitleEquals(driver, 'I am another page title', 5).should.be.rejected;
    });
  });

  describe('with safariAllowPopups', function () {
    this.timeout(MOCHA_TIMEOUT);

    let driver;

    before(async function () {
      const caps = amendCapabilities(SAFARI_CAPS, {
        'appium:safariInitialUrl': GUINEA_PIG_PAGE,
        'appium:safariAllowPopups': true,
        // using JS atoms to open new window will, even if safari does not disable
        // popups, open an alert asking if it is ok.
        'appium:nativeWebTap': true,
      });

      driver = await initSession(caps);
    });
    after(async function () {
      await deleteSession();
    });

    describe('windows', function () {
      before(async function () {
        await driver.setTimeout({implicit: DEFAULT_IMPLICIT_TIMEOUT_MS});
      });

      beforeEach(async function () {
        await openPage(driver, GUINEA_PIG_PAGE);
      });

      it('should be able to open js popup windows', async function () {
        await driver.updateSettings({autoClickAlertSelector: '**/XCUIElementTypeStaticText[`label == "Allow"`]'});

        await driver.executeScript(`window.open('/test/guinea-pig2.html', '_blank');`, []);
        await spinTitleEquals(driver, 'I am another page title', 5).should.eventually.not.be
          .rejected;
        await driver.updateSettings({autoClickAlertSelector: ''});

        await driver.closeWindow();
      });

      it('should throw nosuchwindow if there is not one', async function () {
        await driver
          .switchToWindow('noexistman')
          .should.be.rejectedWith(/window could not be found/);
      });

      it('should be able to open and close windows', async function () {
        if (process.env.CI && isIosVersionBelow('18.0')) {
          this.skip();
        }

        const el = await driver.$('#blanklink');
        await el.click();
        await spinTitleEquals(driver, 'I am another page title');

        await driver.closeWindow();
        await spinTitleEquals(driver, 'I am a page title');
      });

      it('should be able to use window handles', async function () {
        if (process.env.CI && isIosVersionBelow('18.0')) {
          this.skip();
        }

        const initialWindowHandle = await driver.getWindowHandle();

        const el = await driver.$('#blanklink');
        await el.click();
        await spinTitleEquals(driver, 'I am another page title');

        const newWindowHandle = await driver.getWindowHandle();

        // should still have the first page
        await driver.switchToWindow(initialWindowHandle);
        await spinTitleEquals(driver, 'I am a page title');

        // should still have the second page
        await driver.switchToWindow(newWindowHandle);
        await spinTitleEquals(driver, 'I am another page title');

        // close and we should have the original page
        await driver.closeWindow();
        await spinTitleEquals(driver, 'I am a page title');
      });

      it('should be able to go back and forward', async function () {
        if (process.env.CI && isIosVersionBelow('18.0')) {
          this.skip();
        }

        const link = await driver.$('=i am a link');
        await link.click();

        const waitUntilNotExist = async (locator, timeout = 5000) => {
          await driver.setTimeout({implicit: 0});
          try {
            await waitForCondition(async () => _.isEmpty(await driver.$$(locator)), {
              waitMs: timeout,
              intervalMs: 300,
            });
          } catch {
            throw new Error(
              `Element located by '${locator}' still exists after ${timeout}ms timeout`,
            );
          } finally {
            await driver.setTimeout({implicit: DEFAULT_IMPLICIT_TIMEOUT_MS});
          }
        };

        await waitUntilNotExist('#i_am_a_textbox');
        await driver.back();
        await waitUntilNotExist('#only_on_page_2');
        await driver.forward();
        await waitUntilNotExist('#i_am_a_textbox');
        await driver.back();
      });

      // broken on real devices, see https://github.com/appium/appium/issues/5167
      it('should be able to open js popup windows with safariAllowPopups set to true @skip-real-device', async function () {
        if (process.env.CI && isIosVersionBelow('18.0')) {
          this.skip();
        }

        const link = await driver.$('=i am a new window link');
        await link.click();
        await spinTitleEquals(driver, 'I am another page title', 30);
      });
    });

    describe('frames', function () {
      beforeEach(async function () {
        await openPage(driver, GUINEA_PIG_FRAME_PAGE);
      });

      it('should switch to frame by index', async function () {
        await driver.switchToFrame(0);
        await driver.getTitle().should.eventually.equal(FRAMESET_TITLE);

        const h1 = await driver.$('<h1 />');
        await h1.getText().should.eventually.equal(SUB_FRAME_1_TITLE);
      });

      it('should switch to frame by element', async function () {
        await driver.switchToFrame(await driver.$('#frame3'));
        await driver.getTitle().should.eventually.equal(FRAMESET_TITLE);

        const h1 = await driver.$('<h1 />');
        await h1.getText().should.eventually.equal(SUB_FRAME_3_TITLE);
      });

      it('should switch back to default content from frame', async function () {
        await driver.switchToFrame(await driver.$('[name="first"]'));
        await driver.getTitle().should.eventually.equal(FRAMESET_TITLE);

        const h1 = await driver.$('<h1 />');
        await h1.getText().should.eventually.equal(SUB_FRAME_1_TITLE);

        await driver.switchToFrame(null);
        _.isEmpty(await driver.$$('<frameset />')).should.be.false;
      });

      it('should switch to child frames', async function () {
        await driver.switchToFrame(await driver.$('[name="third"]'));
        await driver.getTitle().should.eventually.equal(FRAMESET_TITLE);

        await driver.switchToFrame(await driver.$('[name="childframe"]'));
        _.isEmpty(await driver.$$('#only_on_page_2')).should.be.false;
      });

      it('should execute javascript in frame', async function () {
        await driver.switchToFrame(1);
        await driver.executeScript(GET_ELEM_SYNC, []).should.eventually.equal(SUB_FRAME_2_TITLE);
      });

      it('should execute async javascript in frame', async function () {
        await driver.setTimeout({script: 2000});
        await driver.switchToFrame(0);
        await driver.executeAsync(GET_ELEM_ASYNC).should.eventually.equal(SUB_FRAME_1_TITLE);
      });

      it('should get source within a frame', async function () {
        await driver.getPageSource().should.eventually.include(FRAMESET_TITLE);

        await driver.switchToFrame(0);

        const frameSource = await driver.getPageSource();
        frameSource.should.include(SUB_FRAME_1_TITLE);
        frameSource.should.not.include(FRAMESET_TITLE);
      });
    });

    describe('iframes', function () {
      beforeEach(async function () {
        await openPage(driver, GUINEA_PIG_IFRAME_PAGE);
      });

      it('should switch to iframe by index', async function () {
        await driver.switchToFrame(0);
        await driver.getTitle().should.eventually.equal(IFRAME_FRAMESET_TITLE);

        const h1 = await driver.$('<h1 />');
        await h1.getText().should.eventually.equal(SUB_FRAME_1_TITLE);
      });

      it('should switch to iframe by element', async function () {
        await driver.switchToFrame(await driver.$('#id-iframe3'));
        await driver.getTitle().should.eventually.equal(IFRAME_FRAMESET_TITLE);

        const h1 = await driver.$('<h1 />');
        await h1.getText().should.eventually.equal(SUB_FRAME_3_TITLE);
      });

      it('should not switch to iframe by element of wrong type', async function () {
        const h1 = await driver.findElement('tag name', 'h1');
        await driver.switchToFrame(h1).should.be.rejected;
      });

      it('should switch back to default content from iframe', async function () {
        await driver.switchToFrame(await driver.$('[name="iframe1"]'));
        await driver.getTitle().should.eventually.equal(IFRAME_FRAMESET_TITLE);

        const h1 = await driver.$('<h1 />');
        await h1.getText().should.eventually.equal(SUB_FRAME_1_TITLE);

        await driver.switchToFrame(null);
        _.size(await driver.$$('<iframe />')).should.eql(3);
      });

      it('should get source within an iframe', async function () {
        await driver.getPageSource().should.eventually.include(IFRAME_FRAMESET_TITLE);

        await driver.switchToFrame(await driver.$('[name="iframe1"]'));

        const frameSource = await driver.getPageSource();
        frameSource.should.include(SUB_FRAME_1_TITLE);
        frameSource.should.not.include(IFRAME_FRAMESET_TITLE);
      });
    });
  });
});
