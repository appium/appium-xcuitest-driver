import assert from 'node:assert/strict';
import {describe, it, before, after, afterEach} from 'node:test';

import {retryInterval} from 'asyncbox';
import type {Browser} from 'webdriverio';

import {getUICatalogCaps, amendCapabilities} from '../desired.js';
import {PREDICATE_SEARCH} from '../helpers/element.js';
import {initSession, deleteSession} from '../helpers/session.js';

// leave the long test to Travis
const TYPING_TRIES = process.env.CI ? 100 : 10;

describe('XCUITestDriver - long tests', function () {
  let driver: Browser;

  before(async function () {
    const uiCatalogCaps = await getUICatalogCaps();
    const caps = amendCapabilities(uiCatalogCaps, {'appium:maxTypingFrequency': 20});
    driver = await initSession(caps);
  });
  after(async function () {
    await deleteSession();
  });

  describe('typing', function () {
    const text = 'bunchoftext';
    before(async function () {
      const tfEl = await driver.$('~Text Fields');
      await driver.execute('mobile: scroll', {element: tfEl, toVisible: true});
      await tfEl.click();

      // wait for there to be text fields present
      await retryInterval(10, 1000, async function () {
        const el = await driver.$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeTextField'`);
        await el.clearValue();
      });
    });

    afterEach(async function () {
      const el = await driver.$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeTextField'`);
      await el.clearValue();
    });

    for (let i = 0; i < TYPING_TRIES; i++) {
      it(`should not fail in typing (try #${i + 1})`, async function () {
        const el = await driver.$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeTextField'`);
        await el.setValue(text);
        assert.ok((await el.getValue()).includes(text));
      });
    }
  });
});
