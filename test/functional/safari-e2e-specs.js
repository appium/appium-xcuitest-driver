import { startServer } from '../..';
import { retry } from 'asyncbox';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';

chai.should();
chai.use(chaiAsPromised);

const HOST = "localhost",
      PORT = 4994,
      BUNDLE_ID = 'com.apple.mobilesafari',
      PLATFORM_VERSION = '9.2';

const DEFAULT_CAPS = {
  platformName: 'iOS',
  platformVersion: PLATFORM_VERSION,
  browserName: 'Safari',
  bundleId: BUNDLE_ID,
  deviceName: "iPhone 6",
  automationName: "WebDriverAgent",
};



describe('Safari', () => {
  let server;
  let driver = wd.promiseChainRemote(HOST, PORT);
  before(async () => {
    server = await startServer(PORT, HOST);
  });

  afterEach(async function () {
    this.timeout(3 * 60 * 1000);
    driver.quit();
  });

  after(() => {
    // TODO I don't think this is actually shutting the server down, figure
    // that out
    server.close();
  });

  it('should start a session, navigate to url, get title', async function () {
    this.timeout(120 * 1000);
    await driver.init(DEFAULT_CAPS);
    let contexts = await driver.contexts();
    contexts.length.should.be.above(0);
    await driver.context(contexts[0]);
    let title = await retry(10, async () => {
      let title = await driver.title();
      if (!title) {
        throw new Error('did not get page title');
      }
      return title;
    });
    title.should.equal('Appium: Mobile App Automation Made Awesome.');

    await driver.get('http://saucelabs.com');
    title = await driver.title();
    title.should.include('Sauce Labs');
  });

  it('should delete a session, then be able to start another session', async function () {
    this.timeout(4 * 60 * 1000);
    await driver.init(DEFAULT_CAPS);
    await driver.quit();
    await driver.init(DEFAULT_CAPS);
  });

});
