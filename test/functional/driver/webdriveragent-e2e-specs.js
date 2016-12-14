import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { createDevice, deleteDevice } from 'node-simctl';
import { getVersion } from 'appium-xcode';
import { getSimulator } from 'appium-ios-simulator';
import request from 'request-promise';
import WebDriverAgent from '../../../lib/webDriverAgent'; // eslint-disable-line import/no-unresolved
import { SubProcess } from 'teen_process';
import { PLATFORM_VERSION } from '../desired';


chai.should();
chai.use(chaiAsPromised);

let testUrl = 'http://localhost:8100/tree';

function getStartOpts (device) {
  return {
    device,
    platformVersion: PLATFORM_VERSION,
    host: 'localhost',
    port: 8100,
    realDevice: false
  };
}

describe('WebDriverAgent', () => {
  let xcodeVersion;
  before(async () => {
    xcodeVersion = await getVersion(true);
  });
  describe('with fresh sim', () => {
    let device;
    before(async function () {
      this.timeout(2 * 60 * 1000);
      let simUdid = await createDevice('webDriverAgentTest', 'iPhone 6', PLATFORM_VERSION);
      device = await getSimulator(simUdid);
    });

    after(async function () {
      this.timeout(2 * 60 * 1000);

      await device.shutdown();

      await deleteDevice(device.udid);
    });

    describe('with running sim', function () {
      this.timeout(6 * 60 * 1000);
      beforeEach(async () => {
        await device.run();
      });
      afterEach(async () => {
        await device.shutdown();
      });

      it('should launch agent on a sim', async function () {
        let agent = new WebDriverAgent(xcodeVersion, getStartOpts(device));

        await agent.launch('sessionId');
        await request(testUrl);
        await agent.quit();
      });
    });

    describe('with sim not booted', () => {
      it('should boot sim if not booted', async function () {
        this.timeout(180 * 1000);
        let agent = new WebDriverAgent(xcodeVersion, getStartOpts(device));

        await agent.launch('sessionId');
        await request(testUrl);
        await agent.quit();
        await device.shutdown();
      });

      it('should fail if xcodebuild fails', async function () {
        this.timeout(35 * 1000);

        let agent = new WebDriverAgent(xcodeVersion, getStartOpts(device));

        agent.createXcodeBuildSubProcess = async function () {
          let args = [
            '-workspace',
            this.agentPath,
            // '-scheme',
            // 'XCTUITestRunner',
            '-destination',
            `id=${this.device.udid}`,
            'test'
          ];
          let xcodebuild = new SubProcess('xcodebuild', args);
          return xcodebuild;
        };

        await agent.launch('sessionId')
          .should.eventually.be.rejectedWith('xcodebuild failed');

        await agent.quit();
      });
    });
  });
});
