import { startServer } from '../..';
import path from 'path';
import apps from 'ios-webview-app';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';
import { PLATFORM_VERSION } from './desired';


chai.should();
chai.use(chaiAsPromised);

const HOST = "localhost",
      PORT = 4994;

const DEFAULT_CAPS = {
  platformName: 'iOS',
  platformVersion: PLATFORM_VERSION,
  app: path.resolve(require.resolve('ios-webview-app'), '..', apps[1]),
  deviceName: "iPhone 6",
};

describe.skip('Webview', function () {
  this.timeout(120 * 1000);

  let server, driver;
  before(async () => {
    driver = wd.promiseChainRemote(HOST, PORT);
    server = await startServer(PORT, HOST);
  });
  after(async () => {
    await server.close();
    try {
      await driver.quit();
    } catch (ign) {}
  });

  beforeEach(async () => {
    await driver.init(DEFAULT_CAPS);
  });
  afterEach(async () => {
    await driver.quit();
  });

  it('should start a session, navigate to url, get title', async () => {
    let contexts = await driver.contexts();
    contexts.length.should.equal(2);

    let urlBar = await driver.elementByClassName('XCUIElementTypeTextField');
    await urlBar.sendKeys('appium.io');

    let button = await driver.elementByClassName('XCUIElementTypeButton');
    await button.click();

    await driver.setImplicitWaitTimeout(10000);
    await driver.context(contexts[0]);

    // wait for something on the page, before checking on title
    await driver.elementById('downloadLink');

    let title = await driver.title();
    title.should.equal('Appium: Mobile App Automation Made Awesome.');
  });
});
