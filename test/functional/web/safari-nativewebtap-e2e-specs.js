import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import { SAFARI_CAPS } from '../desired';
import { spinTitleEquals, GUINEA_PIG_PAGE, GUINEA_PIG_SCROLLABLE_PAGE,
         GUINEA_PIG_APP_BANNER_PAGE } from './helpers';
import { killAllSimulators } from '../helpers/simulator';
import { retryInterval } from 'asyncbox';
import wd from 'wd';
import B from 'bluebird';


chai.should();
chai.use(chaiAsPromised);

const caps = _.defaults({
  safariInitialUrl: GUINEA_PIG_PAGE,
  nativeWebTap: true,
}, SAFARI_CAPS);
const spinRetries = 5;

describe('Safari', function () {
  this.timeout(MOCHA_TIMEOUT * 2);

  let driver;
  before(async function () {
    await killAllSimulators();
  });

  function runTests (deviceName) {
    describe(`coordinate conversion - ${deviceName} -`, function () {
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
          if (err.message.includes('Invalid device type: iPhone X')) {
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
        await driver.get(GUINEA_PIG_PAGE);

        let el = await driver.elementByLinkText('i am a link to page 3');
        await el.click();

        await spinTitleEquals(driver, 'Another Page: page 3', spinRetries);
      });

      it('should be able to tap on an element when the app banner is up', async function () {
        await driver.get(GUINEA_PIG_APP_BANNER_PAGE);

        let el = await driver.elementByLinkText('i am a link to page 3');
        await el.click();

        await spinTitleEquals(driver, 'Another Page: page 3', spinRetries);
      });

      it('should be able to tap on an element after scrolling', async function () {
        await driver.get(GUINEA_PIG_SCROLLABLE_PAGE);
        await driver.execute('mobile: scroll', {direction: 'down'});

        let el = await driver.elementByLinkText('i am a link to page 3');
        await el.click();

        await spinTitleEquals(driver, 'Another Page: page 3', spinRetries);
      });

      it('should be able to tap on a button', async function () {
        await driver.get(GUINEA_PIG_PAGE);

        (await driver.source()).should.not.include('Your comments: Hello');

        let textArea = await driver.elementByName('comments');
        await textArea.type('Hello');

        // console.log(await driver.source());
        let el = await driver.elementByName('submit');
        await el.click();

        await retryInterval(5, 500, async function () {
          (await driver.source()).should.include('Your comments: Hello');
        });
      });

      describe('with tabs -', function () {
        beforeEach(async function () {
          await driver.get(GUINEA_PIG_PAGE);
        });
        before(async function () {
          if (skipped) {
            return this.skip();
          }
          await driver.get(GUINEA_PIG_PAGE);

          // open a new tab and go to it
          let el = await driver.elementByLinkText('i am a new window link');
          await el.click();
        });

        it('should be able to tap on an element', async function () {
          await driver.get(GUINEA_PIG_PAGE);

          let el = await driver.elementByLinkText('i am a link to page 3');
          await el.click();

          await spinTitleEquals(driver, 'Another Page: page 3', spinRetries);

          await driver.back();

          // try again, just to make sure
          el = await driver.elementByLinkText('i am a link to page 3');
          await el.click();

          await spinTitleEquals(driver, 'Another Page: page 3', spinRetries);
        });
        it('should be able to tap on an element after scrolling', async function () {
          await driver.get(GUINEA_PIG_SCROLLABLE_PAGE);
          await driver.execute('mobile: scroll', {direction: 'down'});

          let el = await driver.elementByLinkText('i am a link to page 3');
          await el.click();

          await spinTitleEquals(driver, 'Another Page: page 3', spinRetries);
        });
        it('should be able to tap on an element after scrolling, when the url bar is present', async function () {
          // this test can be flakey on Travis
          this.retries(4);

          await driver.get(GUINEA_PIG_SCROLLABLE_PAGE);
          await driver.execute('mobile: scroll', {direction: 'down'});

          // to get the url bar, click at the top
          const ctx = await driver.currentContext();
          try {
            await driver.context('NATIVE_APP');
            const action = new wd.TouchAction(driver);
            action.tap({
              x: 10,
              y: 5,
            });
            await action.perform();

            // time for things to happen
            await B.delay(1000);
          } finally {
            await driver.context(ctx);
          }

          const el = await driver.elementByLinkText('i am a link to page 3');
          await el.click();

          await spinTitleEquals(driver, 'Another Page: page 3', spinRetries);
        });
      });
    });
  }

  // Full tests take a *long* time so skip unless necessary to check conversion

  // // xcode 8.3
  // const deviceNames = ['iPhone 5', 'iPhone 5s',
  //                    'iPhone 6', 'iPhone 6 Plus',
  //                    'iPhone 6s', 'iPhone 6s Plus',
  //                    'iPhone 7', 'iPhone 7 Plus',
  //                    'iPhone SE',
  //                    'iPad Air', 'iPad Air 2',
  //                    'iPad (5th generation)',
  //                    'iPad Pro (9.7-inch)', 'iPad Pro (12.9-inch)', 'iPad Pro (12.9-inch) (2nd generation)', 'iPad Pro (10.5-inch)'];

  // // xcode 9
  // const deviceNames = ['iPhone 6', 'iPhone 6 Plus',
  //                      'iPhone 6s', 'iPhone 6s Plus',
  //                      'iPhone 7', 'iPhone 7 Plus',
  //                      'iPhone SE',
  //                      'iPhone2017-A', 'iPhone2017-B', // 'iPhone2017-C', does not work for iPhone X yet
  //                      'iPad Air', 'iPad Air 2',
  //                      'iPad (5th generation)',
  //                      'iPad Pro (9.7-inch)', 'iPad Pro (12.9-inch)', 'iPad Pro (12.9-inch) (2nd generation)', 'iPad Pro (10.5-inch)'];

  let deviceNames = ['iPad Simulator', 'iPhone 6', 'iPhone X'];
  if (process.env.DEVICE_NAME) {
    deviceNames = [process.env.DEVICE_NAME];
  }

  for (let deviceName of deviceNames) {
    runTests(deviceName);
  }
});
