import assert from 'node:assert/strict';
import {describe, it, before, after, beforeEach, type TestContext} from 'node:test';

import {waitForCondition} from 'asyncbox';
import type {Browser} from 'webdriverio';

import {isEmpty} from '../../../lib/utils/index.js';
import {SAFARI_CAPS, amendCapabilities, isIosVersionBelow} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';
import {
  createGuineaPigServerSession,
  openPage,
  resetWindows,
  spinTitleEquals,
  guineaPigPage,
  guineaPigFramePage,
  guineaPigIframePage,
} from './helpers/index.js';

const GET_ELEM_SYNC = `return document.getElementsByTagName('h1')[0].innerHTML;`;
const GET_ELEM_ASYNC = `arguments[arguments.length - 1](document.getElementsByTagName('h1')[0].innerHTML);`;

const FRAMESET_TITLE = 'Frameset guinea pig';
const IFRAME_FRAMESET_TITLE = 'Iframe guinea pig';
const SUB_FRAME_1_TITLE = 'Sub frame 1';
const SUB_FRAME_2_TITLE = 'Sub frame 2';
const SUB_FRAME_3_TITLE = 'Sub frame 3';
const DEFAULT_IMPLICIT_TIMEOUT_MS = 1000;

describe('safari - windows and frames', function () {
  const guineaPigServer = createGuineaPigServerSession();
  let baseUrl: string;

  before(async function () {
    baseUrl = (await guineaPigServer.setup()).baseUrl;
  });

  after(async function () {
    await guineaPigServer.teardown();
  });

  describe('without safariAllowPopups', function () {
    let driver: Browser;
    before(async function () {
      const caps = amendCapabilities(SAFARI_CAPS, {
        'appium:safariInitialUrl': guineaPigPage(baseUrl),
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
      await assert.rejects(spinTitleEquals(driver, 'I am another page title', 5));
    });
  });

  describe('with safariAllowPopups', function () {
    let driver: Browser;
    before(async function () {
      const caps = amendCapabilities(SAFARI_CAPS, {
        'appium:safariInitialUrl': guineaPigPage(baseUrl),
        'appium:safariAllowPopups': true,
        // using JS atoms to open new window will, even if safari does not disable
        // popups, open an alert asking if it is ok.
        'appium:nativeWebTap': true,
      });

      driver = await initSession(caps);
      await driver.setTimeout({pageLoad: 90000});
    });
    after(async function () {
      await deleteSession();
    });

    describe('windows', function () {
      // Window/popup handling over Safari's remote debugger reliably hangs for minutes
      // (wedging the shared session and cascading into every later test, frames/iframes
      // included) on iOS < 18.0. Skip by actual iOS version rather than by CI, since the
      // same hang reproduces locally against an old simulator.
      before(async function () {
        await driver.setTimeout({implicit: DEFAULT_IMPLICIT_TIMEOUT_MS});
      });

      beforeEach(async function () {
        await resetWindows(driver);
        await openPage(driver, guineaPigPage(baseUrl));
      });

      it('should throw nosuchwindow if there is not one', async function () {
        await assert.rejects(driver.switchToWindow('noexistman'), /window could not be found/);
      });

      it('should be able to open and close windows', async function (ctx: TestContext) {
        if (isIosVersionBelow('18.0')) {
          return ctx.skip();
        }

        const el = await driver.$('#blanklink');
        await el.click();
        await spinTitleEquals(driver, 'I am another page title');

        await driver.closeWindow();
        await spinTitleEquals(driver, 'I am a page title');
      });

      it('should be able to use window handles', async function (ctx: TestContext) {
        if (isIosVersionBelow('18.0')) {
          return ctx.skip();
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

      it('should be able to go back and forward', async function (ctx: TestContext) {
        if (isIosVersionBelow('18.0')) {
          return ctx.skip();
        }

        const link = await driver.$('=i am a link');
        await link.click();

        const waitUntilNotExist = async (locator: string, timeout = 5000) => {
          await driver.setTimeout({implicit: 0});
          try {
            await waitForCondition(async () => isEmpty(await driver.$$(locator)), {
              waitMs: timeout,
              intervalMs: 300,
            });
          } catch {
            throw new Error(`Element located by '${locator}' still exists after ${timeout}ms timeout`);
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

      it('should be able to open js popup windows', async function (ctx: TestContext) {
        if (isIosVersionBelow('18.0')) {
          return ctx.skip();
        }

        await driver.updateSettings({
          autoClickAlertSelector: '**/XCUIElementTypeStaticText[`label == "Allow"`]',
        });

        await driver.executeScript(`window.open('/test/guinea-pig2.html', '_blank');`, []);
        await assert.doesNotReject(spinTitleEquals(driver, 'I am another page title', 5));
        await driver.updateSettings({autoClickAlertSelector: ''});

        await driver.closeWindow();
      });

      // broken on real devices, see https://github.com/appium/appium/issues/5167
      it('should be able to open js popup windows with safariAllowPopups set to true @skip-real-device', async function (ctx: TestContext) {
        if (isIosVersionBelow('18.0')) {
          return ctx.skip();
        }

        const link = await driver.$('=i am a new window link');
        await link.click();
        await spinTitleEquals(driver, 'I am another page title', 30);
      });
    });

    describe('frames', function () {
      beforeEach(async function () {
        await resetWindows(driver);
        await openPage(driver, guineaPigFramePage(baseUrl));
      });

      it('should switch to frame by index', async function () {
        await driver.switchToFrame(0);
        assert.strictEqual(await driver.getTitle(), FRAMESET_TITLE);

        const h1 = await driver.$('<h1 />');
        assert.strictEqual(await h1.getText(), SUB_FRAME_1_TITLE);
      });

      it('should switch to frame by element', async function () {
        await driver.switchToFrame(await driver.$('#frame3'));
        assert.strictEqual(await driver.getTitle(), FRAMESET_TITLE);

        const h1 = await driver.$('<h1 />');
        assert.strictEqual(await h1.getText(), SUB_FRAME_3_TITLE);
      });

      it('should switch back to default content from frame', async function () {
        await driver.switchToFrame(await driver.$('[name="first"]'));
        assert.strictEqual(await driver.getTitle(), FRAMESET_TITLE);

        const h1 = await driver.$('<h1 />');
        assert.strictEqual(await h1.getText(), SUB_FRAME_1_TITLE);

        await driver.switchToFrame(null);
        assert.strictEqual(isEmpty(await driver.$$('<frameset />')), false);
      });

      it('should switch to child frames', async function () {
        await driver.switchToFrame(await driver.$('[name="third"]'));
        assert.strictEqual(await driver.getTitle(), FRAMESET_TITLE);

        await driver.switchToFrame(await driver.$('[name="childframe"]'));
        assert.strictEqual(isEmpty(await driver.$$('#only_on_page_2')), false);
      });

      it('should execute javascript in frame', async function () {
        await driver.switchToFrame(1);
        assert.strictEqual(await driver.executeScript(GET_ELEM_SYNC, []), SUB_FRAME_2_TITLE);
      });

      it('should execute async javascript in frame', async function () {
        await driver.setTimeout({script: 2000});
        await driver.switchToFrame(0);
        assert.strictEqual(await driver.executeAsync(GET_ELEM_ASYNC), SUB_FRAME_1_TITLE);
      });

      it('should get source within a frame', async function () {
        assert.ok((await driver.getPageSource()).includes(FRAMESET_TITLE));

        await driver.switchToFrame(0);

        const frameSource = await driver.getPageSource();
        assert.ok(frameSource.includes(SUB_FRAME_1_TITLE));
        assert.ok(!frameSource.includes(FRAMESET_TITLE));
      });
    });

    describe('iframes', function () {
      beforeEach(async function () {
        await resetWindows(driver);
        await openPage(driver, guineaPigIframePage(baseUrl));
      });

      it('should switch to iframe by index', async function () {
        await driver.switchToFrame(0);
        assert.strictEqual(await driver.getTitle(), IFRAME_FRAMESET_TITLE);

        const h1 = await driver.$('<h1 />');
        assert.strictEqual(await h1.getText(), SUB_FRAME_1_TITLE);
      });

      it('should switch to iframe by element', async function () {
        await driver.switchToFrame(await driver.$('#id-iframe3'));
        assert.strictEqual(await driver.getTitle(), IFRAME_FRAMESET_TITLE);

        const h1 = await driver.$('<h1 />');
        assert.strictEqual(await h1.getText(), SUB_FRAME_3_TITLE);
      });

      it('should not switch to iframe by element of wrong type', async function () {
        const h1 = await driver.findElement('tag name', 'h1');
        await assert.rejects(driver.switchToFrame(h1));
      });

      it('should switch back to default content from iframe', async function () {
        await driver.switchToFrame(await driver.$('[name="iframe1"]'));
        assert.strictEqual(await driver.getTitle(), IFRAME_FRAMESET_TITLE);

        const h1 = await driver.$('<h1 />');
        assert.strictEqual(await h1.getText(), SUB_FRAME_1_TITLE);

        await driver.switchToFrame(null);
        assert.strictEqual((await driver.$$('<iframe />')).length, 3);
      });

      it('should get source within an iframe', async function () {
        assert.ok((await driver.getPageSource()).includes(IFRAME_FRAMESET_TITLE));

        await driver.switchToFrame(await driver.$('[name="iframe1"]'));

        const frameSource = await driver.getPageSource();
        assert.ok(frameSource.includes(SUB_FRAME_1_TITLE));
        assert.ok(!frameSource.includes(IFRAME_FRAMESET_TITLE));
      });
    });
  });
});
