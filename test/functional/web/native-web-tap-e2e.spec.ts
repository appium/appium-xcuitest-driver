import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';

import {retryInterval} from 'asyncbox';
import type {Browser} from 'webdriverio';

import {amendCapabilities, getUICatalogCaps, SAFARI_CAPS, DEVICE_NAME} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';
import {
  createGuineaPigServerSession,
  guineaPigAppBannerPage,
  guineaPigPage,
  guineaPigScrollablePage,
  openPage,
  spinTitle,
  spinTitleEquals,
} from './helpers/index.js';

const IS_CI = Boolean(process.env.CI);
const SPIN_RETRIES = 25;
const PAGE_3_LINK = 'i am a link to page 3';
const PAGE_3_TITLE = 'Another Page: page 3';
const SCROLL_AMT = 1400;

let baseUrl: string;

async function loadPage(driver: Browser, url: string) {
  await retryInterval(5, 1000, async function () {
    await openPage(driver, url);
    assert.ok(!(await spinTitle(driver)).includes('Cannot Open Page'));
  });
}

// Sets up a Safari session against the guinea pig pages, with whatever
// native-tap capabilities the caller wants exercised.
async function initSafariDriver(extraCaps: Record<string, unknown>): Promise<Browser> {
  const driver = await initSession(
    amendCapabilities(SAFARI_CAPS, {
      'appium:deviceName': DEVICE_NAME,
      'appium:safariInitialUrl': guineaPigPage(baseUrl),
      ...extraCaps,
    }),
  );
  return driver;
}

// Sets up a UIKitCatalog session, navigates to its "Web View" screen, and
// switches into that embedded WKWebView's context - a webview with no
// Safari chrome (address bar, tab bar, smart app banner) to throw off the
// calibrated transform - with whatever native-tap capabilities the caller
// wants exercised.
async function initHybridWebviewDriver(extraCaps: Record<string, unknown>): Promise<Browser> {
  const uiCatalogCaps = await getUICatalogCaps();
  const driver = await initSession(amendCapabilities(uiCatalogCaps, extraCaps));

  // The "Web View" cell is below the fold on the UIKitCatalog samples list, but
  // XCTest scrolls it into view on tap, so no explicit scroll/swipe is needed.
  await driver.$('~Web View').click();

  const contexts = (await driver.execute('mobile: getContexts', {waitForWebviewMs: 5000})) as unknown as {
    id: string;
  }[];
  const webviewContext = contexts.find((ctx) => ctx.id.startsWith('WEBVIEW_'));
  assert.ok(webviewContext, `Expected to find a WEBVIEW_ context, but got: ${JSON.stringify(contexts)}`);
  await driver.switchContext(webviewContext!.id);

  return driver;
}

describe('native web tap -', function () {
  const guineaPigServer = createGuineaPigServerSession();

  before(async function () {
    baseUrl = (await guineaPigServer.setup()).baseUrl;
  });

  after(async function () {
    await guineaPigServer.teardown();
  });

  describe('Safari -', function () {
    describe('nativeWebTap -', function () {
      let driver: Browser;

      before(async function () {
        driver = await initSafariDriver({'appium:nativeWebTap': true});
      });

      after(async function () {
        await deleteSession();
      });

      it('should be able to tap on an element', async function () {
        await loadPage(driver, guineaPigPage(baseUrl));

        await driver.$(`=${PAGE_3_LINK}`).click();

        await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
      });

      it('should be able to tap on an element when the app banner is up', async function () {
        await loadPage(driver, guineaPigAppBannerPage(baseUrl));

        await driver.$(`=${PAGE_3_LINK}`).click();

        await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
      });

      it('should be able to tap on an element after scrolling', async function () {
        await loadPage(driver, guineaPigScrollablePage(baseUrl));
        // mobile: scroll selects text instead of scrolling in Safari, so scroll via JS instead.
        await driver.execute(`window.scrollBy(0, ${SCROLL_AMT})`);

        await driver.$(`=${PAGE_3_LINK}`).click();

        await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
      });

      it('should be able to tap on a button', async function () {
        await loadPage(driver, guineaPigPage(baseUrl));

        assert.ok(!(await driver.getPageSource()).includes('Your comments: Hello'));

        const comments = await driver.$('[name="comments"]');
        await driver.elementSendKeys(comments.elementId as any, 'Hello');

        await driver.$('[name="submit"]').click();

        await retryInterval(5, 500, async function () {
          const src = await driver.getPageSource();
          assert.ok(src.includes('Your comments: Hello'));
        });
      });

      it('should be able to handle an alert', async function () {
        await loadPage(driver, guineaPigPage(baseUrl));

        await driver.$('#alert1').click();
        await retryInterval(5, 1000, driver.acceptAlert.bind(driver));
        assert.ok((await driver.getTitle()).includes('I am a page title'));
      });
    });

    describe('nativeWebTapStrict -', function () {
      let driver: Browser;

      before(async function () {
        driver = await initSafariDriver({'appium:nativeWebTapStrict': true});
      });

      after(async function () {
        await deleteSession();
      });

      it('should be able to tap on an element', async function () {
        await loadPage(driver, guineaPigPage(baseUrl));

        await driver.$(`=${PAGE_3_LINK}`).click();

        await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
      });

      it('should be able to tap on an element after scrolling', async function () {
        await loadPage(driver, guineaPigScrollablePage(baseUrl));
        // mobile: scroll selects text instead of scrolling in Safari, so scroll via JS instead.
        await driver.execute(`window.scrollBy(0, ${SCROLL_AMT})`);

        await driver.$(`=${PAGE_3_LINK}`).click();

        await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
      });

      it('should be able to tap on an element after changing orientation', {skip: IS_CI}, async function () {
        await loadPage(driver, guineaPigPage(baseUrl));

        try {
          await driver.setOrientation('LANDSCAPE');

          await driver.$(`=${PAGE_3_LINK}`).click();

          await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
        } finally {
          await driver.setOrientation('PORTRAIT');
        }
      });
    });
  });

  describe('Hybrid webview -', function () {
    describe('nativeWebTap -', function () {
      let driver: Browser;

      before(async function () {
        driver = await initHybridWebviewDriver({'appium:nativeWebTap': true});
      });

      after(async function () {
        await deleteSession();
      });

      it('should be able to tap on an element', async function () {
        await openPage(driver, guineaPigPage(baseUrl));

        await driver.$(`=${PAGE_3_LINK}`).click();

        await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
      });

      it('should be able to tap on an element after scrolling', async function () {
        await openPage(driver, guineaPigScrollablePage(baseUrl));
        await driver.execute(`window.scrollBy(0, ${SCROLL_AMT})`);

        await driver.$(`=${PAGE_3_LINK}`).click();

        await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
      });
    });

    describe('nativeWebTapStrict -', function () {
      let driver: Browser;

      before(async function () {
        driver = await initHybridWebviewDriver({'appium:nativeWebTapStrict': true});
      });

      after(async function () {
        await deleteSession();
      });

      it('should be able to tap on an element', async function () {
        await openPage(driver, guineaPigPage(baseUrl));

        await driver.$(`=${PAGE_3_LINK}`).click();

        await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
      });

      it('should be able to tap on an element after scrolling', async function () {
        await openPage(driver, guineaPigScrollablePage(baseUrl));
        await driver.execute(`window.scrollBy(0, ${SCROLL_AMT})`);

        await driver.$(`=${PAGE_3_LINK}`).click();

        await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
      });

      it('should be able to tap on an element after changing orientation', async function () {
        await openPage(driver, guineaPigPage(baseUrl));

        try {
          await driver.setOrientation('LANDSCAPE');

          await driver.$(`=${PAGE_3_LINK}`).click();

          await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
        } finally {
          await driver.setOrientation('PORTRAIT');
        }
      });
    });
  });
});
