import assert from 'node:assert/strict';
import {describe, it, before, after, type TestContext} from 'node:test';

import {retryInterval} from 'asyncbox';
import type {Browser} from 'webdriverio';

import {SAFARI_CAPS, amendCapabilities, isIosVersionAtLeast, isIosVersionBelow} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';
import {createGuineaPigServerSession, guineaPigPage} from './helpers/index.js';

const IS_CI = Boolean(process.env.CI);
const CI_WEBVIEW_ATOM_WAIT_TIMEOUT_MS = 45000;

describe('safari - alerts', {skip: Boolean(process.env.CI) && isIosVersionBelow('18.0')}, function () {
  let driver: Browser;
  const guineaPigServer = createGuineaPigServerSession();

  before(async function () {
    const {baseUrl} = await guineaPigServer.setup();
    const caps = amendCapabilities(SAFARI_CAPS, {
      'appium:safariInitialUrl': guineaPigPage(baseUrl),
      'appium:safariAllowPopups': true,
      ...(IS_CI ? {'appium:webviewAtomWaitTimeout': CI_WEBVIEW_ATOM_WAIT_TIMEOUT_MS} : {}),
    });

    driver = await initSession(caps);
    await driver.setTimeout({implicit: 0});
  });
  after(async function () {
    await deleteSession();
    await guineaPigServer.teardown();
  });

  async function acceptAlert(driver: any) {
    await retryInterval(5, 500, driver.acceptAlert.bind(driver));
  }

  async function dismissAlert(driver: any) {
    await retryInterval(5, 500, driver.dismissAlert.bind(driver));
  }

  async function findWithRetry(selector: string) {
    let element: any;
    await retryInterval(IS_CI ? 8 : 5, 1000, async function () {
      const els = (await driver.$$(selector)) as unknown as any[];
      if (els.length === 0) {
        throw new Error(`Element '${selector}' not found`);
      }
      element = els[0];
    });
    return element;
  }

  it('should accept alert', async function () {
    const alert = await findWithRetry('#alert1');
    await alert.click();
    await acceptAlert(driver);
    assert.ok((await driver.getTitle()).includes('I am a page title'));
  });

  it('should dismiss alert', async function () {
    const alert = await findWithRetry('#alert1');
    await alert.click();
    await dismissAlert(driver);
    assert.ok((await driver.getTitle()).includes('I am a page title'));
  });

  it('should get text of alert', async function () {
    const alert = await findWithRetry('#alert1');
    await alert.click();
    assert.ok((await driver.getAlertText()).includes('I am an alert'));
    await dismissAlert(driver);
  });
  it('should not get text of alert that closed', async function (ctx: TestContext) {
    if (IS_CI || isIosVersionAtLeast('27.0')) {
      // WDA's alert/text endpoint unreliably falls back to the underlying
      // page's accessibility content instead of raising a "no such alert"
      // error once the alert has actually been dismissed. Confirmed on iOS
      // 27 and observed intermittently on 26.4 in CI as well.
      return ctx.skip();
    }
    const alert = await findWithRetry('#alert1');
    await alert.click();
    await acceptAlert(driver);
    await assert.rejects(
      driver.getAlertText(),
      /An attempt was made to operate on a modal dialog when one was not open/,
    );
  });
  it('should set text of prompt', async function () {
    const alert = await findWithRetry('#prompt1');
    await alert.click();
    await driver.sendAlertText('of course!');
    await acceptAlert(driver);

    const el = await findWithRetry('#promptVal');
    assert.strictEqual(await el.getAttribute('value'), 'of course!');
  });
  it('should fail to set text of alert', async function () {
    const alert = await findWithRetry('#alert1');
    await alert.click();
    await assert.rejects(driver.sendAlertText('yes I do!'), /no input fields/);
    await acceptAlert(driver);
  });
});
