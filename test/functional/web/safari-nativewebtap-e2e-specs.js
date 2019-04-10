import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import { SAFARI_CAPS } from '../desired';
import { openPage, spinTitleEquals, spinTitle, GUINEA_PIG_PAGE,
         GUINEA_PIG_SCROLLABLE_PAGE, GUINEA_PIG_APP_BANNER_PAGE } from './helpers';
import { killAllSimulators } from '../helpers/simulator';
import { retryInterval } from 'asyncbox';
import B from 'bluebird';
import { getDeviceTypes } from 'node-simctl';


/**
 * This test suite can be affected by two environment variables:
 *   1. ALL_DEVICES - will use simctl to get _all_ the iPhone and iPad device
 *                    types available on the current Xcode installation, and
 *                    runs the tests for each one. This is a long process.
 *   2. DEVICE_NAME - the name of a particular device. The tests will be run
 *                    against that device only
 * If neither of these are provided, the tests will be run against a subset
 * of devices that are available (one iPad, on regular iPhone, and the bigger
 * new iPhones that have proven problematic in the past)
 */


chai.should();
chai.use(chaiAsPromised);

const caps = _.defaults({
  safariInitialUrl: GUINEA_PIG_PAGE,
  nativeWebTap: true,
}, SAFARI_CAPS);

const SPIN_RETRIES = 25;

const PAGE_3_LINK = 'i am a link to page 3';
const PAGE_3_TITLE = 'Another Page: page 3';

if (!process.env.REAL_DEVICE) {
  describe('Safari - coordinate conversion -', function () {
    this.timeout(MOCHA_TIMEOUT * 2);

    let devices = [];
    before(async function () {
      await killAllSimulators();

      if (process.env.ALL_DEVICES) {
        // get all the iPhone and iPad devices available
        devices = await getDeviceTypes();
        devices = devices.filter((device) => device.includes('iPhone') || device.includes('iPad'));
      } else if (process.env.DEVICE_NAME) {
        devices = [process.env.DEVICE_NAME];
      } else {
        devices = ['iPad Simulator', 'iPhone 6', 'iPhone X'];
      }

      async function loadPage (driver, url) {
        await retryInterval(5, 1000, async function () {
          await openPage(driver, url);
          const title = await spinTitle(driver);
          title.should.not.include('Cannot Open Page');
        });
      }

      // define the tests, for each device
      for (const deviceName of devices) {
        describe(`${deviceName} -`, function () {
          this.timeout(MOCHA_TIMEOUT * 2);

          let driver;
          let skipped = false;

          before(async function () {
            skipped = false;
            try {
              driver = await initSession(_.defaults({
                deviceName,
                fullReset: true,
                noReset: false,
              }, caps));
            } catch (err) {
              if (err.message.includes('Invalid device type') || err.message.includes('Incompatible device')) {
                skipped = true;
                return this.skip();
              }
              throw err;
            }
          });
          after(async function () {
            await deleteSession();
            await killAllSimulators();
          });

          it('should be able to tap on an element', async function () {
            await loadPage(driver, GUINEA_PIG_PAGE);

            let el = await driver.elementByLinkText(PAGE_3_LINK);
            await el.click();

            await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
          });

          it('should be able to tap on an element when the app banner is up', async function () {
            await loadPage(driver, GUINEA_PIG_APP_BANNER_PAGE);

            let el = await driver.elementByLinkText(PAGE_3_LINK);
            await el.click();

            await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
          });

          it('should be able to tap on an element after scrolling', async function () {
            await loadPage(driver, GUINEA_PIG_SCROLLABLE_PAGE);
            await driver.execute('mobile: scroll', {direction: 'down'});

            let el = await driver.elementByLinkText(PAGE_3_LINK);
            await el.click();

            await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
          });

          it('should be able to tap on a button', async function () {
            this.retries(5);

            await loadPage(driver, GUINEA_PIG_PAGE);

            (await driver.source()).should.not.include('Your comments: Hello');

            let textArea = await driver.elementByName('comments');
            await textArea.type('Hello');

            let el = await driver.elementByName('submit');
            await el.click();

            await retryInterval(5, 500, async function () {
              const src = await driver.source();
              return src.should.include('Your comments: Hello');
            });
          });

          describe('with tabs -', function () {
            beforeEach(async function () {
              await loadPage(driver, GUINEA_PIG_PAGE);
            });
            before(async function () {
              if (skipped) {
                return this.skip();
              }
              await loadPage(driver, GUINEA_PIG_PAGE);

              // open a new tab and go to it
              let el = await driver.elementByLinkText('i am a new window link');
              await el.click();
            });

            it('should be able to tap on an element', async function () {
              await loadPage(driver, GUINEA_PIG_PAGE);

              let el = await driver.elementByLinkText(PAGE_3_LINK);
              await el.click();

              await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);

              await driver.back();

              // try again, just to make sure
              el = await driver.elementByLinkText(PAGE_3_LINK);
              await el.click();

              await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
            });
            it('should be able to tap on an element after scrolling', async function () {
              await loadPage(driver, GUINEA_PIG_SCROLLABLE_PAGE);
              await driver.execute('mobile: scroll', {direction: 'down'});

              let el = await driver.elementByLinkText(PAGE_3_LINK);
              await el.click();

              await spinTitleEquals(driver, PAGE_3_TITLE, SPIN_RETRIES);
            });
            it('should be able to tap on an element after scrolling, when the url bar is present', async function () {
              await loadPage(driver, GUINEA_PIG_SCROLLABLE_PAGE);
              await driver.execute('mobile: scroll', {direction: 'down'});

              // to get the url bar, click on the URL bar
              const ctx = await driver.currentContext();
              try {
                await driver.context('NATIVE_APP');

                // get the reload button, as multi-element find to bypass
                // the implicit wait
                if (_.isEmpty(await driver.elementsByAccessibilityId('ReloadButton'))) {
                  // when there is no reload button, the URL bar is minimized
                  // so tap on it to bring it up
                  await driver.elementByAccessibilityId('URL').click();
                }

                // time for things to happen
                await B.delay(500);
              } finally {
                await driver.context(ctx);
              }

              const el = await driver.elementByLinkText(PAGE_3_LINK);
              await el.click();

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
}
