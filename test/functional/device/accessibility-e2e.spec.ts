import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {retryInterval} from 'asyncbox';
import type {Browser} from 'webdriverio';

import {SETTINGS_CAPS, amendCapabilities} from '../desired.js';
import {PREDICATE_SEARCH} from '../helpers/element.js';
import {initSession, deleteSession} from '../helpers/session.js';

describe('Accessibility', function () {
  let driver: Browser;
  let caps: Record<string, any>;

  beforeEach(function () {
    caps = SETTINGS_CAPS;
  });

  afterEach(async function () {
    try {
      await driver.terminateApp('com.apple.Preferences');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }

    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    try {
      await deleteSession();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  });

  // first session after a Simulator boot: Settings can ignore the tap, so tap again until `selector` shows
  async function openAccessibilityItem(driver: any, selector: string) {
    await retryInterval(3, 0, async function () {
      await driver.$(`${PREDICATE_SEARCH}:name == 'Accessibility'`).click();
      await driver.$(selector).waitForExist({timeout: 5000});
    });
    await driver.$(selector).click();
  }

  describe('ReduceMotion', function () {
    async function getReduceMotion(driver: any) {
      await openAccessibilityItem(
        driver,
        `${PREDICATE_SEARCH}:type == 'XCUIElementTypeCell' AND name IN {'Reduce Motion', 'Motion', 'MOTION_TITLE'}`,
      );
      return await driver
        .$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeSwitch' AND name IN {'Reduce Motion', 'REDUCE_MOTION'}`)
        .getAttribute('value');
    }

    it('should enable reduce motion', async function () {
      caps = amendCapabilities(caps, {'appium:reduceMotion': true});
      driver = await initSession(caps);
      assert.strictEqual(await getReduceMotion(driver), '1');
    });
    it('should disable reduce motion', async function () {
      caps = amendCapabilities(caps, {'appium:reduceMotion': false});
      driver = await initSession(caps);
      assert.strictEqual(await getReduceMotion(driver), '0');
    });
  });

  describe('ReduceTransparency', function () {
    async function getReduceTransparency(driver: any) {
      await openAccessibilityItem(driver, `${PREDICATE_SEARCH}:name IN {'Display & Text Size', 'DISPLAY_AND_TEXT'}`);

      return await driver
        .$(
          `${PREDICATE_SEARCH}:type == 'XCUIElementTypeSwitch' AND name IN {'Reduce Transparency', 'REDUCE_TRANSPARENCY'}`,
        )
        .getAttribute('value');
    }

    it('should enable reduce transparency', async function () {
      caps = amendCapabilities(caps, {'appium:reduceTransparency': true});
      driver = await initSession(caps);
      assert.strictEqual(await getReduceTransparency(driver), '1');
    });
    it('should disable reduce transparency', async function () {
      caps = amendCapabilities(caps, {'appium:reduceTransparency': false});
      driver = await initSession(caps);
      assert.strictEqual(await getReduceTransparency(driver), '0');
    });
  });
});
