import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { retryInterval } from 'asyncbox';
import { getSimulator } from 'appium-ios-simulator';
import { killAllSimulators, shutdownSimulator, deleteDeviceWithRetry } from '../helpers/simulator';
import Simctl from 'node-simctl';
import _ from 'lodash';
import B from 'bluebird';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { UICATALOG_CAPS, UICATALOG_SIM_CAPS } from '../desired';
import { translateDeviceName } from '../../../lib/utils';
import axios from 'axios';


const SIM_DEVICE_NAME = 'xcuitestDriverTest';

const should = chai.should();
chai.use(chaiAsPromised);

const simctl = new Simctl();

async function createDevice () {
  return await simctl.createDevice(
    SIM_DEVICE_NAME,
    translateDeviceName(UICATALOG_SIM_CAPS.platformVersion, UICATALOG_SIM_CAPS.deviceName),
    UICATALOG_SIM_CAPS.platformVersion
  );
}

async function getNumSims () {
  return (await simctl.getDevices())[UICATALOG_SIM_CAPS.platformVersion].length;
}

describe('XCUITestDriver', function () {
  this.timeout(MOCHA_TIMEOUT);

  let baseCaps;
  let caps;

  let driver;
  before(async function () {
    const udid = await createDevice();
    baseCaps = Object.assign({}, UICATALOG_SIM_CAPS, {udid});
    caps = Object.assign({
      usePrebuiltWDA: true,
      wdaStartupRetries: 0,
    }, baseCaps);
  });
  after(async function () {
    const sim = await getSimulator(caps.udid, {
      platform: 'iOS',
      checkExistence: false,
    });
    await shutdownSimulator(sim);
    await deleteDeviceWithRetry(caps.udid);
  });

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    await deleteSession();
  });

  if (!process.env.REAL_DEVICE) {
    it('should start and stop a session', async function () {
      driver = await initSession(baseCaps);
      let els = await driver.elementsByClassName('XCUIElementTypeWindow');
      els.length.should.be.at.least(1);
    });

    it('should start and stop a session doing pre-build', async function () {
      driver = await initSession(Object.assign({prebuildWDA: true}, baseCaps));
      let els = await driver.elementsByClassName('XCUIElementTypeWindow');
      els.length.should.be.at.least(1);
    });

    it('should start and stop a session doing simple build-test', async function () {
      driver = await initSession(Object.assign({useSimpleBuildTest: true}, baseCaps));
      let els = await driver.elementsByClassName('XCUIElementTypeWindow');
      els.length.should.be.at.least(1);
    });

    it('should start and stop a session with only bundle id', async function () {
      let localCaps = Object.assign({}, caps, {
        bundleId: 'com.example.apple-samplecode.UICatalog',
        noReset: true,
      });
      localCaps.app = null;
      await initSession(localCaps).should.not.eventually.be.rejected;
    });

    it('should start and stop a session with only bundle id when no sim is running', async function () {
      await killAllSimulators();
      let localCaps = Object.assign({}, caps, {
        bundleId: 'com.example.apple-samplecode.UICatalog',
        noReset: true,
      });
      localCaps.app = null;
      await initSession(localCaps).should.not.eventually.be.rejected;
    });

    it('should fail to start and stop a session if unknown bundle id used', async function () {
      let localCaps = Object.assign({}, caps, {bundleId: 'io.blahblahblah.blah'});
      localCaps.app = null;
      await initSession(localCaps).should.eventually.be.rejected;
    });

    it('should fail to start and stop a session if unknown bundle id used when no sim is running', async function () {
      await killAllSimulators();
      let localCaps = Object.assign({}, caps, {bundleId: 'io.blahblahblah.blah'});
      localCaps.app = null;
      await initSession(localCaps).should.eventually.be.rejected;
    });

    describe('WebdriverAgent port', function () {
      this.retries(3);

      it('should run on default port if no other specified', async function () {
        let localCaps = Object.assign({}, baseCaps, {
          fullReset: true,
          useNewWDA: true,
        });
        localCaps.wdaLocalPort = null;
        driver = await initSession(localCaps);
        await axios({url: 'http://localhost:8100/status'}).should.not.be.rejected;
      });
      it('should run on port specified', async function () {
        const localCaps = Object.assign({}, baseCaps, {
          fullReset: true,
          wdaLocalPort: 6000,
          useNewWDA: true,
        });
        driver = await initSession(localCaps);
        await axios({url: 'http://localhost:8100/status'})
          .should.eventually.be.rejectedWith(/ECONNREFUSED/);
        await axios({url: 'http://localhost:6000/status'})
          .should.eventually.not.be.rejected;
      });
    });

    describe('initial orientation', function () {
      async function runOrientationTest (initialOrientation) {
        let localCaps = _.defaults({
          orientation: initialOrientation
        }, caps);
        driver = await initSession(localCaps);

        let orientation = await driver.getOrientation();
        orientation.should.eql(initialOrientation);
      }

      for (const orientation of ['LANDSCAPE', 'PORTRAIT']) {
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

      it('default: creates sim and deletes it afterwards', async function () {
        const caps = Object.assign({}, UICATALOG_SIM_CAPS, {enforceFreshSimulatorCreation: true});

        const simsBefore = await getNumSims();
        await initSession(caps);

        const simsDuring = await getNumSims();

        await deleteSession();
        const simsAfter = await getNumSims();

        simsDuring.should.equal(simsBefore + 1);
        simsAfter.should.equal(simsBefore);
      });

      it('with udid: uses sim and resets afterwards if resetOnSessionStartOnly is false', async function () {
        // before
        const udid = await createDevice();
        let sim = await getSimulator(udid, {
          platform: 'iOS',
          checkExistence: false,
        });
        await sim.run();

        // test
        let caps = _.defaults({
          udid,
          fullReset: true,
          resetOnSessionStartOnly: false
        }, UICATALOG_SIM_CAPS);

        (await sim.isRunning()).should.be.true;
        let simsBefore = await getNumSims();
        await initSession(caps);
        let simsDuring = await getNumSims();
        await deleteSession();
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
        const udid = await createDevice();
        let sim = await getSimulator(udid, {
          platform: 'iOS',
          checkExistence: false,
        });
        await sim.run();

        await B.delay(2000);

        // test
        let caps = _.defaults({
          udid,
          noReset: true
        }, UICATALOG_SIM_CAPS);

        (await sim.isRunning()).should.be.true;
        let simsBefore = await getNumSims();
        await initSession(caps);
        let simsDuring = await getNumSims();
        await deleteSession();
        let simsAfter = await getNumSims();
        (await sim.isRunning()).should.be.true;

        simsDuring.should.equal(simsBefore);
        simsAfter.should.equal(simsBefore);

        // cleanup
        await shutdownSimulator(sim);
        await deleteDeviceWithRetry(udid);
      });

      it('with invalid udid: throws an error', async function () {
        // test
        let caps = _.defaults({
          udid: 'some-random-udid'
        }, UICATALOG_SIM_CAPS);

        await initSession(caps)
          .should.eventually.be.rejectedWith('Unknown device or simulator UDID');
      });

      it('with non-existent udid: throws an error', async function () {
        // test
        let udid = 'a77841db006fb1762fee0bb6a2477b2b3e1cfa7d';
        let caps = _.defaults({udid}, UICATALOG_SIM_CAPS);

        await initSession(caps)
          .should.eventually.be.rejectedWith('Unknown device or simulator UDID');
      });

      it('with noReset set to true: leaves sim booted', async function () {
        this.timeout(MOCHA_TIMEOUT);

        // before
        const udid = await createDevice();
        let sim = await getSimulator(udid, {
          platform: 'iOS',
          checkExistence: false,
        });

        // some systems require a pause before initializing.
        await B.delay(2000);

        // test
        let caps = _.defaults({
          udid,
          noReset: true
        }, UICATALOG_SIM_CAPS);

        let simsBefore = await getNumSims();
        await initSession(caps);
        let simsDuring = await getNumSims();
        await deleteSession();
        let simsAfter = await getNumSims();
        (await sim.isRunning()).should.be.true;

        simsDuring.should.equal(simsBefore);
        simsAfter.should.equal(simsBefore);

        // cleanup
        await shutdownSimulator(sim);
        await deleteDeviceWithRetry(udid);
      });
    });

    describe('event timings', function () {
      it('should include event timings if cap is used', async function () {
        let newCaps = Object.assign({}, caps, {eventTimings: true});
        driver = await initSession(newCaps);
        let res = await driver.sessionCapabilities();
        should.exist(res.events);
        should.exist(res.events.newSessionStarted);
        res.events.newSessionStarted[0].should.be.above(res.events.newSessionRequested[0]);
      });
    });
  } else {
    // real device tests
    describe('handle multiple back-to-back sessions', function () {
      it('should not fail when the new session is initiated', async function () {
        await initSession(UICATALOG_CAPS);
        await deleteSession();

        await initSession(UICATALOG_CAPS);
        await deleteSession();

        await initSession(UICATALOG_CAPS);
        await deleteSession();
      });
    });
  }
});
