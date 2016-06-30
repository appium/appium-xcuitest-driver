import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { createDevice, deleteDevice } from 'node-simctl';
import { getSimulator } from 'appium-ios-simulator';
import request from 'request-promise';
import WebDriverAgent from '../../lib/webDriverAgent'; // eslint-disable-line import/no-unresolved
import { SubProcess } from 'teen_process';

chai.should();
chai.use(chaiAsPromised);

const PLATFORM_VERSION = '9.3';
let testUrl = 'http://localhost:8100/tree';

describe('WebDriverAgent', () => {
  describe('with fresh sim', () => {
    let sim;
    before(async function () {
      this.timeout(2 * 60 * 1000);
      let simUdid = await createDevice('webDriverAgentTest', 'iPhone 6', PLATFORM_VERSION);
      sim = await getSimulator(simUdid);
    });

    after(async function () {
      this.timeout(2 * 60 * 1000);
      await deleteDevice(sim.udid);
    });

    describe('with running sim', function () {
      this.timeout(6 * 60 * 1000);
      beforeEach(async () => {
        await sim.run();
      });
      afterEach(async () => {
        await sim.shutdown();
      });

      it('should launch agent on a sim', async function () {
        let agent = new WebDriverAgent({
          sim,
          platformVersion: PLATFORM_VERSION,
          host: 'localhost',
          port: 8100
        });

        await agent.launch('sessionId');
        await request(testUrl);
        await agent.quit();
      });
    });

    describe('with sim not booted', () => {
      it('should boot sim if not booted', async function () {
        this.timeout(75 * 1000);
        let agent = new WebDriverAgent({
          sim,
          platformVersion: PLATFORM_VERSION,
          host: 'localhost',
          port: 8100
        });

        await agent.launch('sessionId');
        await request(testUrl);
        await agent.quit();
        await sim.shutdown();
      });

      it('should fail if xcodebuild fails', async function () {
        this.timeout(35 * 1000);

        let agent = new WebDriverAgent({
          sim,
          platformVersion: PLATFORM_VERSION,
          host: 'localhost',
          port: 8100
        });

        agent.createXcodeBuildSubProcess = function () {
          let args = [
            '-workspace',
            this.agentPath,
            // '-scheme',
            // 'XCTUITestRunner',
            '-destination',
            `id=${this.sim.udid}`,
            'test'
          ];
          return new SubProcess('xcodebuild', args);
        };

        let prom = agent.launch('sessionId');
        await prom.should.be.rejectedWith('xcodebuild failed');
        await agent.quit();
      });
    });
  });
});
