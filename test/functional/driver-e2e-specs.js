import { startServer } from '../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { absolute } from 'ios-test-app';
import wd from 'wd';

chai.should();
chai.use(chaiAsPromised);

const HOST = "localhost",
      PORT = 4994,
      APP = absolute.iphonesimulator;

const DEFAULT_CAPS = {
  platformName: 'iOS',
  platformVersion: '9.1',
  app: APP,
  bundleId: "io.appium.TestApp",
  deviceName: "iPhone 6",
  automationName: "WebDriverAgent",
  agentPath: process.env.AGENT_PATH
};

describe('WebDriverAgentDriver', () => {
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

  it('should start and stop a session', async function () {
    this.timeout(120 * 1000);
    await driver.init(DEFAULT_CAPS);
    let els = await driver.elementsByClassName("UIAButton");
    els.length.should.equal(7);
    await driver.quit();
  });
});
