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
    let agent = new WebDriverAgent({}, fakeConstructorArgs);
    (await fs.exists(agent.agentPath)).should.be.true;
  });
});

describe('launch', () => {
  it('should use webDriverAgentUrl override', async () => {
    let override = "http://mockUrl:8100";
    let args = Object.assign({}, fakeConstructorArgs);
    args.webDriverAgentUrl = override;
    let agent = new WebDriverAgent({}, args);

    (await agent.launch("sessionId")).should.be.equal(override);
  });
});