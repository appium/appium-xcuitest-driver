import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { createDevice, deleteDevice } from 'node-simctl';
import { getVersion } from 'appium-xcode';
import { getSimulator } from 'appium-ios-simulator';
import { killAllSimulators, shutdownSimulator } from '../helpers/simulator';
import request from 'request-promise';
import { SubProcess } from 'teen_process';
import { PLATFORM_VERSION, DEVICE_NAME } from '../desired';
import { MOCHA_TIMEOUT } from '../helpers/session';
import { retryInterval } from 'asyncbox';
import { translateDeviceName } from '../../../lib/utils';

let WebDriverAgent;
if (!process.env.REMOTE) {
  WebDriverAgent = require('../../../lib/wda/webDriverAgent').WebDriverAgent;
}

const SIM_DEVICE_NAME = 'webDriverAgentTest';

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


describe('WebDriverAgent', function () {
  this.timeout(MOCHA_TIMEOUT);
  this.retries(2);

  let xcodeVersion;
  before(async function () {
    // Don't do these tests on Sauce Labs
    if (process.env.REMOTE) {
      this.skip();
    }

    xcodeVersion = await getVersion(true);
  });
  describe('with fresh sim', function () {
    let device;
    before(async function () {
      let simUdid = await createDevice(
        SIM_DEVICE_NAME,
        translateDeviceName(PLATFORM_VERSION, DEVICE_NAME),
        PLATFORM_VERSION
      );
      device = await getSimulator(simUdid);
    });

    after(async function () {
      this.timeout(MOCHA_TIMEOUT);

      await shutdownSimulator(device);

      await deleteDevice(device.udid);
    });

    describe('with running sim', function () {
      this.timeout(6 * 60 * 1000);
      beforeEach(async function () {
        await killAllSimulators();
        await device.run();
      });
      afterEach(async function () {
        try {
          await retryInterval(5, 1000, async function () {
            await shutdownSimulator(device);
          });
        } catch (ign) {}
      });

      it('should launch agent on a sim', async function () {
        let agent = new WebDriverAgent(xcodeVersion, getStartOpts(device));

        await agent.launch('sessionId');
        await request(testUrl).should.be.eventually.rejectedWith(/unknown command/);
        await agent.quit();
      });

      it('should fail if xcodebuild fails', async function () {
        // short timeout
        this.timeout(35 * 1000);

        let agent = new WebDriverAgent(xcodeVersion, getStartOpts(device));

        agent.xcodebuild.createSubProcess = async function () { // eslint-disable-line require-await
          let args = [
            '-workspace',
            `${this.agentPath}dfgs`,
            // '-scheme',
            // 'XCTUITestRunner',
            // '-destination',
            // `id=${this.device.udid}`,
            // 'test'
          ];
          let xcodebuild = new SubProcess('xcodebuild', args, {detached: true});
          return xcodebuild;
        };

        await agent.launch('sessionId')
          .should.eventually.be.rejectedWith('xcodebuild failed');

        await agent.quit();
      });
    });
  });
});
