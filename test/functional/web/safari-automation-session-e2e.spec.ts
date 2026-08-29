import assert from 'node:assert/strict';
import {describe, it, before, after, beforeEach} from 'node:test';

import type {Browser} from 'webdriverio';

import {SAFARI_CAPS, amendCapabilities} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';
import {createGuineaPigServerSession, guineaPigPage, openPage} from './helpers/index.js';

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

  it('drives the page through a real automation session end-to-end, then swaps back to atoms cleanly', async function () {
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

      // a W3C Actions call with a web element as its origin - atoms never supported this
      await driver
        .action('pointer', {parameters: {pointerType: 'mouse'}})
        .move({origin: heading})
        .down()
        .up()
        .perform();

      // getCookies
      const cookies = await driver.getAllCookies();
      assert.ok(Array.isArray(cookies));

      // screenshot
      const screenshot = await driver.takeScreenshot();
      assert.ok(typeof screenshot === 'string' && screenshot.length > 0);
    } finally {
      await driver.executeScript('mobile: stopAutomationSession', []);
    }

    // one more atoms-based command, to confirm the swap-back works cleanly
    const heading = await driver.$('#i_am_an_id');
    assert.strictEqual(await heading.getText(), 'I am a div');
  });
});
