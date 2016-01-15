import { startServer } from '../..';
import path from 'path';
import apps from 'ios-webview-app';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';

chai.should();
chai.use(chaiAsPromised);

const HOST = "localhost",
      PORT = 4994,
      PLATFORM_VERSION = '9.2';

const DEFAULT_CAPS = {
  platformName: 'iOS',
  platformVersion: PLATFORM_VERSION,
  app: path.resolve(require.resolve('ios-webview-app'), '..', apps[1]),
  deviceName: "iPhone 6",
  automationName: "WebDriverAgent",
};



describe('Webview', () => {
  let server;
  let driver = wd.promiseChainRemote(HOST, PORT);
  before(async () => {
    server = await startServer(PORT, HOST);
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
    contexts.length.should.equal(2);

    let urlBar = await driver.elementByClassName('UIATextField');
    let button = await driver.elementByClassName('UIAButton');
    await urlBar.sendKeys('appium.io');
    await button.click();

    await driver.context('WEBVIEW_1');
    let title = await driver.title();
    title.should.equal('Appium: Mobile App Automation Made Awesome.');

    await driver.quit();
  });

});
