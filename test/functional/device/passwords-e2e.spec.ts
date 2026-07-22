import {describe, it, before, afterEach, beforeEach} from 'node:test';

import {use, expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';
import type {Browser} from 'webdriverio';

import {getUICatalogCaps, amendCapabilities} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';

use(chaiAsPromised);

describe('Passwords', function () {
  let driver: Browser;
  let caps: Record<string, any>;
  let uiCatalogCaps: Record<string, any>;

  before(async function () {
    uiCatalogCaps = await getUICatalogCaps();
  });

  beforeEach(function () {
    caps = uiCatalogCaps;
  });

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    try {
      await deleteSession();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  });

  describe('AutoFillPasswords', function () {
    async function isPasswordsMenuShown(driver: any) {
      const el = await driver.$('~Text Fields');
      await el.click();

      const textField = await driver.$('XCUIElementTypeSecureTextField');
      await textField.waitForExist({timeout: 500});
      await textField.click();

      const passwordsMenu = await driver.$('~Passwords');
      return await passwordsMenu.isExisting();
    }

    it('should enable password autofill menu in the keyboard', async function () {
      caps = amendCapabilities(caps, {'appium:autoFillPasswords': true});
      driver = await initSession(caps);
      await expect(isPasswordsMenuShown(driver)).to.eventually.eql(true);
    });
    it('should disable password autofill menu in the keyboard', async function () {
      caps = amendCapabilities(caps, {'appium:autoFillPasswords': false});
      driver = await initSession(caps);
      await expect(isPasswordsMenuShown(driver)).to.eventually.eql(false);
    });
  });
});
