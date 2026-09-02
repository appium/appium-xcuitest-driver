import assert from 'node:assert/strict';
import {describe, it, before, after, beforeEach} from 'node:test';

import type {Browser} from 'webdriverio';

import {SAFARI_CAPS, amendCapabilities} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';
import {createGuineaPigServerSession, guineaPigPage, openPage} from './helpers/index.js';

const IS_CI = Boolean(process.env.CI);

describe('safari - automation session', function () {
  let driver: Browser;
  let baseUrl: string;
  const guineaPigServer = createGuineaPigServerSession();

  before(async function () {
    baseUrl = (await guineaPigServer.setup()).baseUrl;
    const caps = amendCapabilities(SAFARI_CAPS, {
      'appium:safariInitialUrl': guineaPigPage(baseUrl),
    });
    driver = await initSession(caps);
  });

  after(async function () {
    await deleteSession();
    await guineaPigServer.teardown();
  });

  beforeEach(async function () {
    await openPage(driver, guineaPigPage(baseUrl));
  });

  // Flaky on CI: https://github.com/appium/appium-xcuitest-driver/actions/runs/33364493966/job/99403222833
  it(
    'drives the page through a real automation session end-to-end, then switches back to the pre-automation-session context on stop',
    {skip: IS_CI},
    async function () {
      const preAutomationContext = await driver.getContext();
      await driver.executeScript('mobile: startAutomationSession', []);
      try {
        // starting a session always opens a fresh tab (Automation.getBrowsingContexts can only ever
        // see tabs the session itself created) - navigate it to the guinea pig page explicitly.
        await driver.url(guineaPigPage(baseUrl));

        // findElement + getText
        const heading = await driver.$('#i_am_an_id');
        assert.strictEqual(await heading.getText(), 'I am a div');

        // findElement + click + sendKeys
        const comments = await driver.$('#comments');
        await comments.click();
        await comments.setValue('hello from the automation session');
        assert.strictEqual(await comments.getAttribute('value'), 'hello from the automation session');

        // getCookies
        const cookies = await driver.getAllCookies();
        assert.ok(Array.isArray(cookies));

        // screenshot
        const screenshot = await driver.takeScreenshot();
        assert.ok(typeof screenshot === 'string' && screenshot.length > 0);

        // A W3C Actions call (performInteractionSequence) wedges the connection - the next command
        // sent afterward never gets a response. Disabled until fixed upstream:
        // https://bugs.webkit.org/show_bug.cgi?id=322937
        //
        // await driver
        //   .action('pointer', {parameters: {pointerType: 'touch'}})
        //   .move({origin: heading})
        //   .down()
        //   .up()
        //   .perform();
      } finally {
        await driver.executeScript('mobile: stopAutomationSession', []);
      }

      // releasing the on-device automation grant requires closing and reopening the whole
      // remote-debugger connection - stopAutomationSession then switches back to whichever
      // web view was active before the session started, rather than dropping to native context.
      assert.strictEqual(await driver.getContext(), preAutomationContext);
      // and that context should still be usable
      const heading = await driver.$('#i_am_an_id');
      assert.strictEqual(await heading.getText(), 'I am a div');
    },
  );
});
