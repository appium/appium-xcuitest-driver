import {describe, it, before, after} from 'node:test';

import {retryInterval} from 'asyncbox';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';
import type {Browser} from 'webdriverio';

import {SAFARI_CAPS, amendCapabilities, isIosVersionBelow} from '../desired';
import {initSession, deleteSession, E2E_TIMEOUT} from '../helpers/session';
import {createGuineaPigServerSession, guineaPigPage} from './helpers';

chai.use(chaiAsPromised);

const IS_CI = Boolean(process.env.CI);
const CI_WEBVIEW_ATOM_WAIT_TIMEOUT_MS = 20000;

describe(
  'safari - alerts',
  {timeout: E2E_TIMEOUT, skip: Boolean(process.env.CI) && isIosVersionBelow('18.0')},
  function () {
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
      expect(await driver.getTitle()).to.include('I am a page title');
    });

    it('should dismiss alert', async function () {
      const alert = await findWithRetry('#alert1');
      await alert.click();
      await dismissAlert(driver);
      expect(await driver.getTitle()).to.include('I am a page title');
    });

    it('should get text of alert', async function () {
      const alert = await findWithRetry('#alert1');
      await alert.click();
      expect(await driver.getAlertText()).to.include('I am an alert');
      await dismissAlert(driver);
    });
    it('should not get text of alert that closed', async function () {
      const alert = await findWithRetry('#alert1');
      await alert.click();
      await acceptAlert(driver);
      await expect(driver.getAlertText()).to.be.rejectedWith(
        /An attempt was made to operate on a modal dialog when one was not open/,
      );
    });
    it('should set text of prompt', async function () {
      const alert = await findWithRetry('#prompt1');
      await alert.click();
      await driver.sendAlertText('of course!');
      await acceptAlert(driver);

      const el = await findWithRetry('#promptVal');
      expect(await el.getAttribute('value')).to.eql('of course!');
    });
    it('should fail to set text of alert', async function () {
      const alert = await findWithRetry('#alert1');
      await alert.click();
      await expect(driver.sendAlertText('yes I do!')).to.be.rejectedWith(/no input fields/);
      await acceptAlert(driver);
    });
  },
);
