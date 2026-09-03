import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';

import type {Browser} from 'webdriverio';

import {amendCapabilities, SAFARI_CAPS, DEVICE_NAME} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';
import {createGuineaPigServerSession, guineaPigDragAndDropPage, openPage} from './helpers/index.js';

describe('w3c actions - webview -', function () {
  let driver: Browser;
  let baseUrl: string;
  const guineaPigServer = createGuineaPigServerSession();

  before(async function () {
    baseUrl = (await guineaPigServer.setup()).baseUrl;
    driver = await initSession(
      amendCapabilities(SAFARI_CAPS, {
        'appium:deviceName': DEVICE_NAME,
        'appium:safariInitialUrl': guineaPigDragAndDropPage(baseUrl),
      }),
    );
  });

  after(async function () {
    await deleteSession();
    await guineaPigServer.teardown();
  });

  it('should perform a drag and drop via the W3C actions API while handled by native WDA', async function () {
    await openPage(driver, guineaPigDragAndDropPage(baseUrl));

    const columnA = await driver.$('#column-a');
    const columnB = await driver.$('#column-b');
    await columnA.waitForExist({timeout: 5000});
    await columnB.waitForExist({timeout: 5000});

    assert.strictEqual((await columnA.getText()).trim(), 'A');
    assert.strictEqual((await columnB.getText()).trim(), 'B');

    // in a plain webview (no automation session), performActions is handled by native WDA, which
    // has no notion of web elements - column-a/column-b here must be resolved to native
    // coordinates. Moving the pointer over the drop target repeatedly (not just teleporting
    // there in one jump) mirrors how a real drag gesture is driven.
    let action = driver
      .action('pointer', {parameters: {pointerType: 'touch'}})
      .move({duration: 0, origin: columnA})
      .down({button: 0})
      .pause(100);
    for (let i = 0; i < 10; i++) {
      action = action.move({duration: 60, origin: columnB}).pause(40);
    }
    await action.pause(300).up({button: 0}).perform();

    await driver.waitUntil(async () => (await columnA.getText()).trim() === 'B', {
      timeout: 5000,
      timeoutMsg: 'columns did not swap content after performing the drag and drop actions',
    });

    // content swapped between the two columns
    assert.strictEqual((await columnA.getText()).trim(), 'B');
    assert.strictEqual((await columnB.getText()).trim(), 'A');

    // further validation: the pointerup handler must have fired too, resetting the
    // opacity/hover styling set on pointerdown/pointermove, proving the full drag
    // lifecycle ran to completion
    const aStyle = ((await columnA.getAttribute('style')) ?? '').replace(/\s/g, '');
    assert.ok(aStyle.includes('opacity:1'), `Expected column-a opacity to be reset, got style="${aStyle}"`);

    const aClass = (await columnA.getAttribute('class')) ?? '';
    const bClass = (await columnB.getAttribute('class')) ?? '';
    assert.ok(!aClass.includes('over'), `Expected column-a to not have the "over" class, got "${aClass}"`);
    assert.ok(!bClass.includes('over'), `Expected column-b to not have the "over" class, got "${bClass}"`);
  });

  it('should reject a W3C action whose element origin is currently out of view', async function () {
    await openPage(driver, guineaPigDragAndDropPage(baseUrl));

    // never scrolled into view - a native-context action can't be driven against it, since WDA
    // can only see whatever's actually on screen right now
    const offScreenColumn = await driver.$('#off-screen-column');
    await offScreenColumn.waitForExist({timeout: 5000});

    let rejected = false;
    try {
      await driver
        .action('pointer', {parameters: {pointerType: 'touch'}})
        .move({duration: 0, origin: offScreenColumn})
        .down({button: 0})
        .up({button: 0})
        .perform();
    } catch (err) {
      rejected = true;
      assert.match((err as Error).message, /out of (view|bounds)/i);
    }
    assert.ok(rejected, 'Expected the action to be rejected for an out-of-view element origin');
  });
});
