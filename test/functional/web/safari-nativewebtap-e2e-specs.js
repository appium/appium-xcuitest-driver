import { startServer } from '../../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';
import _ from 'lodash';
import { HOST, PORT, MOCHA_TIMEOUT } from '../helpers/session';
import { SAFARI_CAPS } from '../desired';
import { spinTitleEquals, GUINEA_PIG_PAGE, GUINEA_PIG_SCROLLABLE_PAGE,
         GUINEA_PIG_APP_BANNER_PAGE } from './helpers';
import { killAllSimulators } from 'appium-ios-simulator';


chai.should();
chai.use(chaiAsPromised);

const caps = _.defaults({
  safariInitialUrl: GUINEA_PIG_PAGE,
  nativeWebTap: true,
}, SAFARI_CAPS);
const spinRetries = 5;

describe('Safari', function () {
  let server, driver;
  before(async () => {
    driver = wd.promiseChainRemote(HOST, PORT);
    server = await startServer(PORT, HOST);
  });

  after(async () => {
    if (server) {
      await server.close();
    }
  });

  function runTests (deviceName) {
    describe(`coordinate conversion - ${deviceName} -`, function () {
      this.timeout(MOCHA_TIMEOUT * 2);

      before(async () => {
        await driver.init(_.defaults({
          deviceName,
          fullReset: true,
          noReset: false,
        }, caps));
        await driver.setImplicitWaitTimeout(5000);
      });
      after(async function () {
        await driver.quit();
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

      describe('with tabs -', function () {
        beforeEach(async function () {
          await driver.get(GUINEA_PIG_PAGE);
        });
        before(async function () {
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
          await driver.get(GUINEA_PIG_SCROLLABLE_PAGE);
          await driver.execute('mobile: scroll', {direction: 'down'});

          let el = await driver.elementByLinkText('i am a link to page 3');
          await el.click();

          await spinTitleEquals(driver, 'Another Page: page 3', spinRetries);

          // going back will reveal the full url bar
          await driver.back();

          // make sure we get the correct position again
          el = await driver.elementByLinkText('i am a link to page 3');
          await el.click();

          await spinTitleEquals(driver, 'Another Page: page 3', spinRetries);
        });
      });
    });
  }

  for (let deviceName of ['iPhone 6', 'iPad Simulator']) {
    runTests(deviceName);
  }
});
