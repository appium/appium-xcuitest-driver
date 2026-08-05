import assert from 'node:assert/strict';
import {describe, it, before, after, beforeEach, afterEach, type TestContext} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import util from 'node:util';

import {retryInterval} from 'asyncbox';
import sharp from 'sharp';
import type {Browser} from 'webdriverio';

import {isIosVersionBelow, isIosVersionAtLeast, getUICatalogCaps} from '../desired.js';
import {createGuineaPigServerSession, guineaPigPage} from '../helpers/guinea-pig/index.js';
import {initSession, deleteSession} from '../helpers/session.js';

describe('XCUITestDriver - basics -', function () {
  let driver: Browser;
  const guineaPigServer = createGuineaPigServerSession();

  before(async function () {
    const uiCatalogCaps = await getUICatalogCaps();
    driver = await initSession(uiCatalogCaps);
  });
  after(async function () {
    await deleteSession();
    await guineaPigServer.teardown();
  });

  describe('status -', function () {
    it('should get the server status', async function () {
      const status = (await driver.status()) as any;
      assert.ok(status.build.version !== undefined && status.build.version !== null);
    });

    it('should return status immediately if another operation is in progress', async function () {
      await driver.setTimeout({implicit: 10000});
      const findElementPromise = driver.$('#WrongLocator');
      const status = (await driver.status()) as any;
      assert.ok(status.build.version !== undefined && status.build.version !== null);
      assert.strictEqual(util.inspect(findElementPromise).includes('pending'), true);
      try {
        await findElementPromise;
      } catch (err: any) {
        assert.strictEqual(err.status, 7);
      }
    });
  });

  describe('source -', function () {
    function checkSource(src: string) {
      // should have full elements
      assert.ok(src.includes('<AppiumAUT>'));
      assert.ok(src.includes('<XCUIElementTypeApplication'));

      // should not have any XCTest errors
      assert.ok(!src.includes('AX error'));
    }
    describe('plain -', function () {
      it('should get the source for the page', async function () {
        const src = await driver.getPageSource();
        assert.strictEqual(typeof src, 'string');
        checkSource(src);
      });
    });
    describe('json parsed -', function () {
      it('should get source with useJSONSource', async function () {
        await driver.updateSettings({useJSONSource: true});
        const src = await driver.getPageSource();
        checkSource(src);
      });
    });
  });

  describe('deactivate app -', function () {
    it('should background the app for the specified time', async function () {
      const before = Date.now();
      await driver.background(4);
      assert.ok(Date.now() - before > 4000);
      assert.notStrictEqual((await driver.getPageSource()).indexOf('<AppiumAUT>'), -1);
    });
  });

  describe('screenshot -', function () {
    after(async function () {
      try {
        await driver.setOrientation('PORTRAIT');
      } catch {}
    });
    it('should get an app screenshot', async function () {
      const screenshot = await driver.takeScreenshot();
      assert.ok(screenshot !== undefined && screenshot !== null);
      assert.strictEqual(typeof screenshot, 'string');

      // make sure WDA didn't crash, by using it again
      const els = await driver.$$('~Alert Views');
      assert.strictEqual(els.length, 1);
    });

    it('should get an app screenshot in landscape mode', async function () {
      const screenshot1 = await driver.takeScreenshot();
      assert.ok(screenshot1 !== undefined && screenshot1 !== null);

      try {
        await driver.setOrientation('LANDSCAPE');
      } catch {}
      // take a little pause while it orients, otherwise you get the screenshot
      // on an angle
      await delay(500);

      const screenshot2 = await driver.takeScreenshot();
      assert.ok(screenshot2 !== undefined && screenshot2 !== null);
      assert.notStrictEqual(screenshot2, screenshot1);
    });
  });

  describe('viewportScreenshot -', function () {
    it('should get a cropped screenshot of the viewport without statusbar', async function (ctx: TestContext) {
      if (process.env.CI) {
        // Skip on GHA. Local had no issue but GHA had failed in 'mobile: viewportScreenshot'.
        return ctx.skip();
      }

      const {statusBarSize, scale} = (await driver.execute('mobile: deviceScreenInfo')) as any;
      const viewportRect = (await driver.execute('mobile: viewportRect')) as any;
      const fullScreen = await driver.takeScreenshot();
      const viewScreen = (await driver.execute('mobile: viewportScreenshot')) as any;
      const fullImg = sharp(Buffer.from(fullScreen, 'base64'));
      const {width: fullImgWidth, height: fullImgHeight} = await fullImg.metadata();
      const viewImg = sharp(Buffer.from(viewScreen, 'base64'));
      const {width: viewImgWidth, height: viewImgHeight} = await viewImg.metadata();
      if (
        fullImgWidth === undefined ||
        fullImgHeight === undefined ||
        viewImgWidth === undefined ||
        viewImgHeight === undefined
      ) {
        throw new Error('Image dimensions must not be undefined');
      }
      // Viewport size can be smaller than the full image size + status bar on some devices.
      assert.ok(fullImgHeight >= viewImgHeight! + Math.round(scale * statusBarSize.height));
      assert.strictEqual(viewImgHeight, viewportRect.height);
      assert.ok(fullImgWidth >= viewImgWidth!);
    });
  });

  describe('logging -', function () {
    describe('types -', function () {
      it('should get the list of available logs', async function () {
        const actualTypes = await driver.getLogTypes();
        for (const expectedType of ['syslog', 'crashlog', 'performance', 'safariConsole', 'safariNetwork', 'server']) {
          assert.ok(actualTypes.includes(expectedType));
        }
      });
    });

    describe('retrieval -', function () {
      it('should throw an error when an invalid type is given', async function () {
        await assert.rejects(driver.getLogs('something-random'));
      });
      it('should get system logs', async function () {
        assert.ok(Array.isArray(await driver.getLogs('syslog')));
      });
      it('should get crash logs', async function () {
        assert.ok(Array.isArray(await driver.getLogs('crashlog')));
      });
    });
  });

  describe('orientation -', function () {
    beforeEach(async function () {
      await driver.setOrientation('PORTRAIT');
    });
    afterEach(async function () {
      await driver.setOrientation('PORTRAIT');
    });
    it('should get the current orientation', async function () {
      const orientation = await driver.getOrientation();
      assert.ok(['PORTRAIT', 'LANDSCAPE'].includes(orientation));
    });
    it('should set the orientation', async function () {
      await driver.setOrientation('LANDSCAPE');

      assert.strictEqual(await driver.getOrientation(), 'LANDSCAPE');
    });
    it('should be able to interact with an element in LANDSCAPE', async function () {
      await driver.setOrientation('LANDSCAPE');

      const el = await driver.$('#Buttons');
      await el.click();

      await assert.doesNotReject(driver.findElement('css selector', '#Button'));

      await driver.back();
    });
  });

  describe('window size -', function () {
    it('should be able to get the current window size', async function () {
      const size = await driver.getWindowRect();
      assert.strictEqual(typeof size.width, 'number');
      assert.strictEqual(typeof size.height, 'number');
    });
  });

  describe('geo location -', function () {
    it('should work on Simulator', async function () {
      await assert.doesNotReject(driver.execute('mobile: getSimulatedLocation'));
      await assert.doesNotReject(
        driver.execute('mobile: setSimulatedLocation', {latitude: '30.0001', longitude: '21.0002'}),
      );
    });
  });

  describe('shake -', function () {
    it('should work on Simulator', async function () {
      await assert.doesNotReject(driver.execute('mobile: shake'));
    });
  });

  describe('lock -', function () {
    it('should properly lock and unlock the device', async function (ctx: TestContext) {
      if (isIosVersionAtLeast('27.0')) {
        // WDA's IOHID-based lock workaround for iOS 27 (commit 64be2388) is not
        // reliably locking the screen within its (WDA-internal, non-configurable)
        // 5s timeout yet.
        return ctx.skip();
      }
      try {
        await driver.lock();
        assert.strictEqual(await driver.isLocked(), true);
      } finally {
        await driver.unlock();
      }
      assert.strictEqual(await driver.isLocked(), false);
    });
  });

  describe('contexts -', function () {
    before(async function () {
      await driver.execute('mobile: scroll', {direction: 'down'});
      await driver.$('~Web View').click();
    });
    after(async function () {
      await driver.back();
      await driver.execute('mobile: scroll', {direction: 'up'});
    });

    it('should start a session, navigate to url, get title', async function (ctx: TestContext) {
      if (process.env.CI && isIosVersionBelow('18.0')) {
        return ctx.skip();
      }

      const contexts = (await driver.execute('mobile: getContexts', {waitForWebviewMs: 10000})) as unknown as {
        id: string;
      }[];
      if (process.env.CI && contexts.length < 2) {
        // Skip on CI, since the simulator may be too slow to fetch a webview context in time
        return ctx.skip();
      }

      await driver.switchContext(contexts[1].id);
      const {baseUrl} = await guineaPigServer.setup();
      await driver.navigateTo(guineaPigPage(baseUrl));

      await retryInterval(100, 1000, async function () {
        const title = await driver.getTitle();
        assert.strictEqual(title, 'I am a page title');
      });

      await driver.switchContext(contexts[0].id);
    });
  });
});
