import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import { util } from 'appium/support';
import { initSession, deleteSession, hasDefaultPrebuiltWDA, MOCHA_TIMEOUT } from '../helpers/session';
import { extractCapabilityValue, amendCapabilities, SETTINGS_CAPS, SAFARI_CAPS, DEVICE_NAME, DEVICE_NAME_FOR_SAFARI_IPAD } from '../desired';
import {
  openPage, spinTitleEquals, spinTitle, GUINEA_PIG_PAGE,
  GUINEA_PIG_SCROLLABLE_PAGE, GUINEA_PIG_APP_BANNER_PAGE
} from './helpers';
import { retryInterval } from 'asyncbox';
import B from 'bluebird';
import {CLASS_CHAIN_SEARCH} from '../helpers/element';

chai.should();
chai.use(chaiAsPromised);

const caps = amendCapabilities(SAFARI_CAPS, {
  'appium:safariInitialUrl': GUINEA_PIG_PAGE,
  'appium:nativeWebTap': true,
  'appium:usePrebuiltWDA': hasDefaultPrebuiltWDA(),
});

const SPIN_RETRIES = 25;

const PAGE_3_LINK = 'i am a link to page 3';
const PAGE_3_TITLE = 'Another Page: page 3';

describe('Safari - coordinate conversion -', function () {
  this.timeout(MOCHA_TIMEOUT * 2);

  const devices = [DEVICE_NAME, DEVICE_NAME_FOR_SAFARI_IPAD];
  before(function () {
    async function loadPage (driver, url) {
      await retryInterval(5, 1000, async function () {
        await openPage(driver, url);
        await spinTitle(driver).should.eventually.not.include('Cannot Open Page');
      });
    }

    // Close all tabs in Safari before running tests because left over tabs can affect the test results.
    // If possible, it's probably better to kick com.apple.mobilesafari.settings.DeleteAllDataAndCachesTask
    // task in com.apple.Preferences app or something equivalent rather than closing tabs via GUI.
    async function closeAllTabsViaSettingsApp (deviceName) {
      const newCaps = {
        'appium:deviceName': deviceName,
        'appium:usePrebuiltWDA': hasDefaultPrebuiltWDA(),
      };
      const localSettingsCaps = amendCapabilities(SETTINGS_CAPS, newCaps);
      const driver = await initSession(localSettingsCaps);
      await driver.$(CLASS_CHAIN_SEARCH + ':**/XCUIElementTypeStaticText[`label == "Safari"`]').click();
      await driver.$('~CLEAR_HISTORY_AND_DATA').click();
      if (await driver.$$('~Clear').length > 0) { // for iPad
        await driver.$('~Clear').click();
      } else { // for iPhone
        await driver.$('~Clear History and Data').click();
      }
      if (util.compareVersions(extractCapabilityValue(localSettingsCaps, 'appium:platformVersion'), '>=', '16.0')) {
        await driver.$(CLASS_CHAIN_SEARCH + ':**/XCUIElementTypeButton[`label == "Close Tabs"`]').click();
      }
      await deleteSession();
    }

    // define the tests, for each device
    for (const deviceName of devices) {
      describe(`${deviceName} -`, function () {
        this.timeout(MOCHA_TIMEOUT * 2);

        let driver;
        const localCaps = amendCapabilities(caps, {'appium:deviceName': deviceName});
        let skipped = false;

        before(async function () {
          skipped = false;
          try {
            await closeAllTabsViaSettingsApp(deviceName);
            driver = await initSession(localCaps);
          } catch (err) {
            if (err.message.includes('Invalid device type') || err.message.includes('Incompatible device')) {
              skipped = true;
              return this.skip();
            }
            throw err;
          }
          if (process.env.CI) {
            await driver.setTimeouts(10000);
          }
        });
        after(async function () {
          await deleteSession();
        });
        beforeEach(async function () {
          await driver.updateSettings({
            nativeWebTapStrict: false,
          });
        });

        it('should be able to tap on an element', async function () {
          await loadPage(driver, GUINEA_PIG_PAGE);

          await driver.$(`=${PAGE_3_LINK}`).click();

          await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
        });

        it('should be able to tap on an element when the app banner is up', async function () {
          await loadPage(driver, GUINEA_PIG_APP_BANNER_PAGE);

          await driver.$(`=${PAGE_3_LINK}`).click();

          await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
        });

        it('should be able to bypass measuring the offset of banner', async function () {
          await driver.updateSettings({
            nativeWebTapStrict: true,
          });

          await loadPage(driver, GUINEA_PIG_APP_BANNER_PAGE);
          await driver.$(`=${PAGE_3_LINK}`).click();
          await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);

          await driver.updateSettings({ nativeWebTapSmartAppBannerVisibility: 'invisible' });
          await loadPage(driver, GUINEA_PIG_APP_BANNER_PAGE);
          await driver.$(`=${PAGE_3_LINK}`).click();
          await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
        });

        it('should be able to tap on an element after scrolling', async function () {
          await loadPage(driver, GUINEA_PIG_SCROLLABLE_PAGE);
          await driver.execute('mobile: scroll', {direction: 'down'});

          await driver.$(`=${PAGE_3_LINK}`).click();

          await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
        });

        it('should be able to tap on a button', async function () {
          this.retries(5);

          await loadPage(driver, GUINEA_PIG_PAGE);

          (await driver.getPageSource()).should.not.include('Your comments: Hello');

          const comments = await driver.$('[name="comments"]');
          await driver.elementSendKeys(comments.elementId, 'Hello');

          await driver.$('[name="submit"]').click();

          await retryInterval(5, 500, async function () {
            const src = await driver.getPageSource();
            return src.should.include('Your comments: Hello');
          });
        });

        it('should be able to handle an alert', async function () {
          await loadPage(driver, GUINEA_PIG_PAGE);

          await driver.$('#alert1').click();
          await retryInterval(5, 1000, driver.acceptAlert.bind(driver));
          await driver.getTitle().should.eventually.include('I am a page title');
        });

        describe('with tabs -', function () {
          before(async function () {
            if (skipped || !deviceName.toLowerCase().includes('ipad')) {
              return this.skip();
            }
            await loadPage(driver, GUINEA_PIG_PAGE);

            // open a new tab and go to it
            await driver.$(`=i am a new window link`).click();

            await retryInterval(10, 1000, async function () {
              await driver.getTitle().should.eventually.eql('I am another page title');
            });
          });

          it('should be able to tap on an element', async function () {
            await loadPage(driver, GUINEA_PIG_PAGE);

            await driver.$(`=${PAGE_3_LINK}`).click();

            await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);

            await driver.back();

            // try again, just to make sure
            await driver.$(`=${PAGE_3_LINK}`).click();

            await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
          });

          it('should be able to bypass measuring the offset', async function () {
            await driver.updateSettings({
              nativeWebTapStrict: true,
            });

            await loadPage(driver, GUINEA_PIG_PAGE);
            await driver.$(`=${PAGE_3_LINK}`).click();

            await driver.updateSettings({ nativeWebTapTabBarVisibility: 'visible' });
            await loadPage(driver, GUINEA_PIG_PAGE);
            await driver.$(`=${PAGE_3_LINK}`).click();
          });

          it('should be able to tap on an element after scrolling', async function () {
            await loadPage(driver, GUINEA_PIG_SCROLLABLE_PAGE);
            await driver.execute('mobile: scroll', {direction: 'down'});

            await driver.$(`=${PAGE_3_LINK}`).click();

            await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
          });

          it('should be able to tap on an element after scrolling, when the url bar is present', async function () {
            await loadPage(driver, GUINEA_PIG_SCROLLABLE_PAGE);
            await driver.execute('mobile: scroll', {direction: 'down'});

            // to get the url bar, click on the URL bar
            const ctx = await driver.getContext();
            try {
              await driver.switchContext('NATIVE_APP');

              // get the reload button, as multi-element find to bypass
              // the implicit wait
              if (_.isEmpty(await driver.$$('~ReloadButton'))) {
                // when there is no reload button, the URL bar is minimized
                // so tap on it to bring it up
                await driver.$('~Address Bar').click();
              }

              // time for things to happen
              await B.delay(500);
            } finally {
              await driver.switchContext(ctx);
            }

            await driver.$(`=${PAGE_3_LINK}`).click();

            await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
          });
        });
      });
    }
  });

  it.skip('should have devices array set', function () {
    // this block is just here so that the `before` block is run
    // it does not, however, need to actually run. Mocha FTW!
  });
});
