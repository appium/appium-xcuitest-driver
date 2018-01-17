import { startServer } from '../../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';
import request from 'request-promise';
import { retryInterval } from 'asyncbox';
import { killAllSimulators, getSimulator } from 'appium-ios-simulator';
import { getDevices, createDevice, deleteDevice } from 'node-simctl';
import _ from 'lodash';
import B from 'bluebird';
import { HOST, PORT, MOCHA_TIMEOUT } from '../helpers/session';
import { UICATALOG_CAPS, UICATALOG_SIM_CAPS, W3C_CAPS } from '../desired';


const SIM_DEVICE_NAME = 'xcuitestDriverTest';

const should = chai.should();
chai.use(chaiAsPromised);

const getNumSims = async () => {
  return (await getDevices())[UICATALOG_SIM_CAPS.platformVersion].length;
};
const deleteDeviceWithRetry = async function (udid) {
  try {
    await retryInterval(10, 1000, deleteDevice, udid);
  } catch (ign) {}
};

describe('XCUITestDriver', function () {
  this.timeout(MOCHA_TIMEOUT);

  let caps;

  let server, driver;
  before(async function () {
    driver = wd.promiseChainRemote(HOST, PORT);
    server = await startServer(PORT, HOST);

    const udid = await createDevice(SIM_DEVICE_NAME,
      UICATALOG_SIM_CAPS.deviceName, UICATALOG_SIM_CAPS.platformVersion);
    caps = Object.assign({}, UICATALOG_SIM_CAPS, {udid});
  });
  after(async function () {
    await server.close();

    const sim = await getSimulator(caps.udid);
    await sim.shutdown();
    await deleteDeviceWithRetry(caps.udid);
  });

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    try {
      await driver.quit();
    } catch (ign) {}
  });

  if (!process.env.REAL_DEVICE) {
    it('should start and stop a session', async function () {
      await driver.init(caps);
      let els = await driver.elementsByClassName("XCUIElementTypeWindow");
      els.length.should.be.at.least(1);
    });

    it('should start and stop a session doing pre-build', async function () {
      await driver.init(Object.assign({prebuildWDA: true}, caps));
      let els = await driver.elementsByClassName("XCUIElementTypeWindow");
      els.length.should.be.at.least(1);
    });

    it('should start and stop a session doing simple build-test', async function () {
      await driver.init(Object.assign({useSimpleBuildTest: true}, caps));
      let els = await driver.elementsByClassName("XCUIElementTypeWindow");
      els.length.should.be.at.least(1);
    });

    it('should start and stop a session with only bundle id', async function () {
      let localCaps = Object.assign({}, caps, {bundleId: 'com.example.apple-samplecode.UICatalog'});
      localCaps.app = null;
      await driver.init(localCaps).should.not.eventually.be.rejected;
    });

    it('should start and stop a session with only bundle id when no sim is running', async function () {
      await killAllSimulators();
      let localCaps = Object.assign({}, caps, {bundleId: 'com.example.apple-samplecode.UICatalog'});
      localCaps.app = null;
      await driver.init(localCaps).should.not.eventually.be.rejected;
    });

    it('should fail to start and stop a session if unknown bundle id used', async function () {
      let localCaps = Object.assign({}, caps, {bundleId: 'io.blahblahblah.blah'});
      localCaps.app = null;
      await driver.init(localCaps).should.eventually.be.rejected;
    });

    it('should fail to start and stop a session if unknown bundle id used when no sim is running', async function () {
      await killAllSimulators();
      let localCaps = Object.assign({}, caps, {bundleId: 'io.blahblahblah.blah'});
      localCaps.app = null;
      await driver.init(localCaps).should.eventually.be.rejected;
    });

    describe('WebdriverAgent port', function () {
      it('should run on default port if no other specified', async function () {
        let localCaps = Object.assign({}, caps, {
          fullReset: true,
          showIOSLog: true,
          useNewWDA: true,
        });
        localCaps.wdaLocalPort = null;
        await driver.init(localCaps);
        let logs = await driver.log('syslog');
        if (!process.env.CI) {
          logs.some((line) => line.message.indexOf(':8100<-') !== -1).should.be.true;
        }
      });
      it('should run on port specified', async function () {
        let localCaps = Object.assign({}, caps, {
          fullReset: true,
          showIOSLog: true,
          wdaLocalPort: 6000,
          useNewWDA: true,
        });
        await driver.init(localCaps);
        let logs = await driver.log('syslog');
        if (!process.env.CI) {
          logs.some((line) => line.message.indexOf(':8100<-') !== -1).should.be.false;
          logs.some((line) => line.message.indexOf(':6000<-') !== -1).should.be.true;
        }
      });
    });

    describe('initial orientation', async function () {
      async function runOrientationTest (initialOrientation) {
        let localCaps = _.defaults({
          orientation: initialOrientation
        }, caps);
        await driver.init(localCaps);

        let orientation = await driver.getOrientation();
        orientation.should.eql(initialOrientation);
      }

      for (let orientation of ['LANDSCAPE', 'PORTRAIT']) {
        it(`should be able to start in a ${orientation} mode`, async function () {
          this.timeout(MOCHA_TIMEOUT);
          await runOrientationTest(orientation);
        });
      }
    });

    describe('reset', function () {
      beforeEach(async function () {
        await retryInterval(5, 1000, async () => {
          await killAllSimulators();
        });
      });

      it.skip('default: creates sim and deletes it afterwards', async () => {
        let caps = UICATALOG_SIM_CAPS;

        await killAllSimulators();
        let simsBefore = await getNumSims();
        await driver.init(caps);

        let simsDuring = await getNumSims();

        await driver.quit();
        let simsAfter = await getNumSims();

        simsDuring.should.equal(simsBefore + 1);
        simsAfter.should.equal(simsBefore);
      });

      it('with udid: uses sim and resets afterwards if resetOnSessionStartOnly is false', async function () {
        // before
        const udid = await createDevice(SIM_DEVICE_NAME,
          UICATALOG_SIM_CAPS.deviceName, UICATALOG_SIM_CAPS.platformVersion);
        let sim = await getSimulator(udid);
        await sim.run();

        // test
        let caps = _.defaults({
          udid,
          fullReset: true,
          resetOnSessionStartOnly: false
        }, UICATALOG_SIM_CAPS);

        (await sim.isRunning()).should.be.true;
        let simsBefore = await getNumSims();
        await driver.init(caps);
        let simsDuring = await getNumSims();
        await driver.quit();
        let simsAfter = await getNumSims();
        (await sim.isRunning()).should.be.false;

        // make sure no new simulators were created during the test
        simsDuring.should.equal(simsBefore);
        simsAfter.should.equal(simsBefore);

        // cleanup
        await deleteDeviceWithRetry(udid);
      });

      it('with udid booted: uses sim and leaves it afterwards', async function () {
        // before
        const udid = await createDevice(SIM_DEVICE_NAME,
          UICATALOG_SIM_CAPS.deviceName, UICATALOG_SIM_CAPS.platformVersion);
        let sim = await getSimulator(udid);
        await sim.run();

        await B.delay(2000);

        // test
        let caps = _.defaults({
          udid,
          noReset: true
        }, UICATALOG_SIM_CAPS);

        (await sim.isRunning()).should.be.true;
        let simsBefore = await getNumSims();
        await driver.init(caps);
        let simsDuring = await getNumSims();
        await driver.quit();
        let simsAfter = await getNumSims();
        (await sim.isRunning()).should.be.true;

        simsDuring.should.equal(simsBefore);
        simsAfter.should.equal(simsBefore);

        // cleanup
        await sim.shutdown();
        await deleteDeviceWithRetry(udid);
      });

      it('with invalid udid: throws an error', async function () {
        // test
        let caps = _.defaults({
          udid: 'some-random-udid'
        }, UICATALOG_SIM_CAPS);

        await driver.init(caps).should.be.rejectedWith('Unknown device or simulator UDID');
      });

      it('with non-existent udid: throws an error', async function () {
        // test
        let udid = 'a77841db006fb1762fee0bb6a2477b2b3e1cfa7d';
        let caps = _.defaults({udid}, UICATALOG_SIM_CAPS);

        await driver.init(caps).should.be.rejectedWith('Unknown device or simulator UDID');
      });

      it('with noReset set to true: leaves sim booted', async function () {
        this.timeout(MOCHA_TIMEOUT);

        // before
        const udid = await createDevice(SIM_DEVICE_NAME,
          UICATALOG_SIM_CAPS.deviceName, UICATALOG_SIM_CAPS.platformVersion);
        let sim = await getSimulator(udid);

        // some systems require a pause before initializing.
        await B.delay(2000);

        // test
        let caps = _.defaults({
          udid,
          noReset: true
        }, UICATALOG_SIM_CAPS);

        let simsBefore = await getNumSims();
        await driver.init(caps);
        let simsDuring = await getNumSims();
        await driver.quit();
        let simsAfter = await getNumSims();
        (await sim.isRunning()).should.be.true;

        simsDuring.should.equal(simsBefore);
        simsAfter.should.equal(simsBefore);

        // cleanup
        await sim.shutdown();
        await deleteDeviceWithRetry(udid);
      });
    });

    describe('event timings', function () {
      it('should include event timings if cap is used', async function () {
        let newCaps = Object.assign({}, caps, {eventTimings: true});
        await driver.init(newCaps);
        let res = await driver.sessionCapabilities();
        should.exist(res.events);
        should.exist(res.events.newSessionStarted);
        res.events.newSessionStarted[0].should.be.above(res.events.newSessionRequested[0]);
      });
    });
    describe('w3c compliance', function () {
      const sessionUrl = `http://${HOST}:${PORT}/wd/hub/session`;
      it('should accept w3c formatted caps', async function () {
        const { status, value, sessionId } = await request.post({url: sessionUrl, json: W3C_CAPS});
        should.not.exist(status);
        value.should.exist;
        value.capabilities.should.exists;
        should.not.exist(sessionId);
        should.exist(value.sessionId);
        await request.delete({url: `${sessionUrl}/${value.sessionId}`});
      });
      it('should not accept w3c caps if missing "platformName" capability', async function () {
        await request.post({
          url: sessionUrl,
          json: _.omit(W3C_CAPS, ['capabilities.alwaysMatch.platformName']),
        }).should.eventually.be.rejectedWith(/\'platformName\' can\'t be blank/);
      });
      it('should accept the "appium:" prefix', async function () {
        const w3cCaps = _.cloneDeep(W3C_CAPS);
        const alwaysMatch = w3cCaps.capabilities.alwaysMatch;
        const deviceName = alwaysMatch.deviceName;
        delete alwaysMatch.deviceName;
        await request.post({url: sessionUrl, json: w3cCaps}).should.eventually.be.rejected;
        alwaysMatch['appium:deviceName'] = deviceName;
        const { value } = await request.post({url: sessionUrl, json: w3cCaps});
        value.should.exist;
        await request.delete(`${sessionUrl}/${value.sessionId}`);
      });
      it('should receive 404 status code if call findElement on one that does not exist', async function () {
        const { value } = await request.post({url: sessionUrl, json: W3C_CAPS});
        try {
          await request.post({
            url: `${sessionUrl}/${value.sessionId}/element`,
            json: {
              using: 'accessibility id',
              value: 'Bad Selector'
            },
          });
        } catch (e) {
          e.statusCode.should.equal(404);
        }
        await request.delete({url: `${sessionUrl}/${value.sessionId}`});
      });
    });
  } else {
    // real device tests
    describe('handle multiple back-to-back sessions', function () {
      it('should not fail when the new session is initiated', async function () {
        await driver.init(UICATALOG_CAPS);
        await driver.quit();

        await driver.init(UICATALOG_CAPS);
        await driver.quit();

        await driver.init(UICATALOG_CAPS);
        await driver.quit();
      });
    });
  }
});
