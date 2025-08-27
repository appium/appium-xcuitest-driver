import {retryInterval} from 'asyncbox';
import {getSimulator} from 'appium-ios-simulator';
import {killAllSimulators, deleteDeviceWithRetry, cleanupSimulator} from '../helpers/simulator';
import {Simctl} from 'node-simctl';
import B from 'bluebird';
import {MOCHA_TIMEOUT, initSession, deleteSession, HOST} from '../helpers/session';
import {
  UICATALOG_SIM_CAPS,
  amendCapabilities,
  extractCapabilityValue,
  PLATFORM_VERSION,
  DEVICE_NAME,
} from '../desired';
import {translateDeviceName} from '../../../lib/utils';
import axios from 'axios';

const SIM_DEVICE_NAME = 'xcuitestDriverTest';

const simctl = new Simctl();

async function createDevice() {
  return await simctl.createDevice(
    SIM_DEVICE_NAME,
    translateDeviceName(PLATFORM_VERSION, DEVICE_NAME),
    PLATFORM_VERSION,
  );
}

async function getNumSims() {
  return (await simctl.getDevices())[PLATFORM_VERSION].length;
}

describe('XCUITestDriver', function () {
  this.timeout(MOCHA_TIMEOUT);

  let baseCaps;
  let caps;
  let driver;
  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    const udid = await createDevice();
    baseCaps = amendCapabilities(UICATALOG_SIM_CAPS, {'appium:udid': udid});
    caps = amendCapabilities(baseCaps, {
      'appium:usePrebuiltWDA': true,
      'appium:wdaStartupRetries': 0,
    });
  });
  after(async function () {
    const sim = await getSimulator(extractCapabilityValue(caps, 'appium:udid'), {
      platform: 'iOS',
      checkExistence: false,
    });
    await cleanupSimulator(sim);
  });

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    await deleteSession();
  });

  it('should start and stop a session', async function () {
    driver = await initSession(baseCaps);
    const els = await driver.$$('XCUIElementTypeWindow');
    els.length.should.be.at.least(1);
  });

  it('should start and stop a session doing pre-build', async function () {
    driver = await initSession(amendCapabilities(baseCaps, {'appium:prebuildWDA': true}));
    const els = await driver.$$('XCUIElementTypeWindow');
    els.length.should.be.at.least(1);
  });

  it('should start and stop a session doing simple build-test', async function () {
    driver = await initSession(amendCapabilities(baseCaps, {'appium:useSimpleBuildTest': true}));
    const els = await driver.$$('XCUIElementTypeWindow');
    els.length.should.be.at.least(1);
  });

  it('should start and stop a session with only bundle id', async function () {
    const localCaps = amendCapabilities(caps, {
      'appium:bundleId': 'com.example.apple-samplecode.UICatalog',
      'appium:noReset': true,
      'appium:app': undefined,
    });
    await initSession(localCaps).should.not.be.rejected;
  });

  it('should start and stop a session with only bundle id when no sim is running', async function () {
    await killAllSimulators();
    const localCaps = amendCapabilities(caps, {
      'appium:bundleId': 'com.example.apple-samplecode.UICatalog',
      'appium:noReset': true,
      'appium:app': undefined,
    });
    await initSession(localCaps).should.not.be.rejected;
  });

  it('should fail to start and stop a session if unknown bundle id used', async function () {
    const localCaps = amendCapabilities(caps, {
      'appium:bundleId': 'io.blahblahblah.blah',
      'appium:app': undefined,
    });
    await initSession(localCaps).should.be.rejected;
  });

  it('should fail to start and stop a session if unknown bundle id used when no sim is running', async function () {
    await killAllSimulators();
    const localCaps = amendCapabilities(caps, {
      'appium:bundleId': 'io.blahblahblah.blah',
      'appium:app': undefined,
    });
    await initSession(localCaps).should.be.rejected;
  });

  describe('WebdriverAgent port', function () {
    this.retries(3);

    it('should run on default port if no other specified', async function () {
      const localCaps = amendCapabilities(baseCaps, {
        'appium:fullReset': true,
        'appium:useNewWDA': true,
        'appium:wdaLocalPort': undefined,
      });
      driver = await initSession(localCaps);
      await axios({url: `http://${HOST}:8100/status`}).should.not.be.rejected;
    });
    it('should run on port specified', async function () {
      const localCaps = amendCapabilities(baseCaps, {
        'appium:fullReset': true,
        'appium:useNewWDA': true,
        'appium:wdaLocalPort': 6000,
      });
      driver = await initSession(localCaps);
      await axios({url: `http://${HOST}:8100/status`}).should.be.rejectedWith(/ECONNREFUSED/);
      await axios({url: `http://${HOST}:8100/status`}).should.eventually.not.be.rejected;
    });
  });

  describe('initial orientation', function () {
    async function runOrientationTest(initialOrientation) {
      const localCaps = amendCapabilities(caps, {
        'appium:orientation': initialOrientation,
      });
      driver = await initSession(localCaps);

      await driver.getOrientation().should.eventually.eql(initialOrientation);
    }

    for (const orientation of ['LANDSCAPE', 'PORTRAIT']) {
      it(`should be able to start in a ${orientation} mode`, async function () {
        await runOrientationTest(orientation);
      });
    }
  });

  describe('reset', function () {
    beforeEach(async function () {
      await deleteSession();

      await retryInterval(5, 1000, async () => {
        await killAllSimulators();
      });
    });

    it('default: creates sim and deletes it afterwards', async function () {
      const caps = amendCapabilities(UICATALOG_SIM_CAPS, {
        'appium:enforceFreshSimulatorCreation': true,
      });

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

      try {
        // test
        const caps = amendCapabilities(UICATALOG_SIM_CAPS, {
          'appium:udid': udid,
          'appium:fullReset': true,
          'appium:resetOnSessionStartOnly': false,
        });

        (await sim.isRunning()).should.be.true;
        const simsBefore = await getNumSims();
        await initSession(caps);
        const simsDuring = await getNumSims();
        await deleteSession();
        const simsAfter = await getNumSims();
        (await sim.isRunning()).should.be.false;

        // make sure no new simulators were created during the test
        simsDuring.should.equal(simsBefore);
        simsAfter.should.equal(simsBefore);
      } finally {
        // cleanup
        await deleteDeviceWithRetry(udid);
      }
    });

    it('with udid booted: uses sim and leaves it afterwards', async function () {
      // before
      const udid = await createDevice();
      const sim = await getSimulator(udid, {
        platform: 'iOS',
        checkExistence: false,
      });
      await sim.run();

      try {
        await B.delay(2000);

        // test
        const caps = amendCapabilities(UICATALOG_SIM_CAPS, {
          'appium:udid': udid,
          'appium:noReset': true,
        });

        (await sim.isRunning()).should.be.true;
        const simsBefore = await getNumSims();
        await initSession(caps);
        const simsDuring = await getNumSims();
        await deleteSession();
        const simsAfter = await getNumSims();
        (await sim.isRunning()).should.be.true;

        simsDuring.should.equal(simsBefore);
        simsAfter.should.equal(simsBefore);
      } finally {
        await cleanupSimulator(sim);
      }
    });

    it('with invalid udid: throws an error', async function () {
      // test
      const caps = amendCapabilities(UICATALOG_SIM_CAPS, {
        'appium:udid': 'some-random-udid',
      });

      await initSession(caps).should.be.rejectedWith('Unknown device or simulator UDID');
    });

    it('with non-existent udid: throws an error', async function () {
      // test
      const udid = 'a77841db006fb1762fee0bb6a2477b2b3e1cfa7d';
      const caps = amendCapabilities(UICATALOG_SIM_CAPS, {'appium:udid': udid});

      await initSession(caps).should.be.rejectedWith('Unknown device or simulator UDID');
    });

    it('with noReset set to true: leaves sim booted', async function () {
      // before
      const udid = await createDevice();
      const sim = await getSimulator(udid, {
        platform: 'iOS',
        checkExistence: false,
      });

      try {
        // some systems require a pause before initializing.
        await B.delay(2000);

        // test
        const caps = amendCapabilities(UICATALOG_SIM_CAPS, {
          'appium:udid': udid,
          'appium:noReset': true,
        });

        const simsBefore = await getNumSims();
        await initSession(caps);
        const simsDuring = await getNumSims();
        await deleteSession();
        const simsAfter = await getNumSims();
        (await sim.isRunning()).should.be.true;

        simsDuring.should.equal(simsBefore);
        simsAfter.should.equal(simsBefore);
      } finally {
        await cleanupSimulator(sim);
      }
    });
  });
});
