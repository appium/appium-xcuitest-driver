import {describe, it, before, afterEach} from 'node:test';

import {use, expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';
import type {Browser} from 'webdriverio';

import {UICATALOG_BUNDLE_ID, TESTAPP_BUNDLE_ID} from '../../setup.js';
import {getMultipleApps, amendCapabilities} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';

use(chaiAsPromised);

describe('OtherApps', function () {
  let caps: Record<string, any>;
  let driver: Browser;

  before(async function () {
    const multipleApps = await getMultipleApps();
    caps = amendCapabilities(multipleApps, {
      'appium:wdaStartupRetries': 0,
    });
  });

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    await deleteSession();
  });

  it('should start and stop a session', async function () {
    driver = await initSession(caps);
    await expect(driver.isAppInstalled(TESTAPP_BUNDLE_ID)).to.eventually.be.equal(true);
    await expect(driver.isAppInstalled(UICATALOG_BUNDLE_ID)).to.eventually.be.equal(true);
  });
});
