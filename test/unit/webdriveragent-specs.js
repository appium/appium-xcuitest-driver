import WebDriverAgent from '../../lib/webdriveragent';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { fs } from 'appium-support';

chai.should();
chai.use(chaiAsPromised);

let fakeConstructorArgs = {
  device: 'some sim',
  platformVersion: '9',
  host: 'me',
  port: '5000',
  realDevice: false
};

describe('Constructor', () => {
  it('should have a binary for the webdriver agent', async () => {
    let agent = new WebDriverAgent(fakeConstructorArgs);
    await fs.exists(agent.agentPath);
  });
});
