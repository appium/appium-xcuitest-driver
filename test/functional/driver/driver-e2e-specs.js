import { startServer } from '../../..';
import { simBooted } from '../../../lib/simulator-management.js';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';
import { killAllSimulators, getSimulator } from 'appium-ios-simulator';
import { getDevices, createDevice, deleteDevice } from 'node-simctl';
import _ from 'lodash';
import { HOST, PORT, MOCHA_TIMEOUT } from '../helpers/session';
import { UICATALOG_CAPS, UICATALOG_SIM_CAPS } from '../desired';


const should = chai.should();
chai.use(chaiAsPromised);

let getNumSims = async () => {
  return (await getDevices())[UICATALOG_SIM_CAPS.platformVersion].length;
};

describe('XCUITestDriver', function () {
  this.timeout(MOCHA_TIMEOUT);

  let server, driver;
  before(async () => {
    driver = wd.promiseChainRemote(HOST, PORT);
    server = await startServer(PORT, HOST);
  });
  after(async () => {
    await server.close();
  });

  afterEach(async () => {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    try {
      await driver.quit();
    } catch (ign) {}
  });

  if (!process.env.REAL_DEVICE) {
    it('should start and stop a session', async function () {
      await driver.init(UICATALOG_SIM_CAPS);
      let els = await driver.elementsByClassName("XCUIElementTypeWindow");
      els.length.should.be.at.least(1);
      await driver.quit();
    });

    it('should start and stop a session doing pre-build', async function () {
      await driver.init(_.defaults({prebuildWDA: true}, UICATALOG_SIM_CAPS));
      let els = await driver.elementsByClassName("XCUIElementTypeWindow");
      els.length.should.be.at.least(1);
      await driver.quit();
    });

    it('should start and stop a session doing simple build-test', async function () {
      await driver.init(_.defaults({useSimpleBuildTest: true}, UICATALOG_SIM_CAPS));
      let els = await driver.elementsByClassName("XCUIElementTypeWindow");
      els.length.should.be.at.least(1);
      await driver.quit();
    });

    /* jshint ignore:start */
    describe('initial orientation', async () => {
      async function runOrientationTest (initialOrientation) {
        let caps = _.defaults({
          orientation: initialOrientation
        }, UICATALOG_SIM_CAPS);
        await driver.init(caps);

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
    /* jshint ignore:end */

    describe('reset', () => {
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

      it('with udid: uses sim and resets afterwards if resetOnSessionStartOnly is false', async () => {
        // before
        let udid = await createDevice('webDriverAgentTest', 'iPhone 6', UICATALOG_SIM_CAPS.platformVersion);
        let sim = await getSimulator(udid);
        await sim.run();

        // test
        let caps = _.defaults({
          udid,
          fullReset: true,
          resetOnSessionStartOnly: false
        }, UICATALOG_SIM_CAPS);

        (await simBooted(sim)).should.be.true;
        let simsBefore = await getNumSims();
        await driver.init(caps);
        let simsDuring = await getNumSims();
        await driver.quit();
        let simsAfter = await getNumSims();
        (await simBooted(sim)).should.be.false;

        // make sure no new simulators were created during the test
        simsDuring.should.equal(simsBefore);
        simsAfter.should.equal(simsBefore);

        // cleanup
        await deleteDevice(udid);
      });

      it('with udid booted: uses sim and leaves it afterwards', async () => {
        // before
        let udid = await createDevice('webDriverAgentTest', 'iPhone 6', UICATALOG_SIM_CAPS.platformVersion);
        let sim = await getSimulator(udid);
        await sim.run();

        // test
        let caps = _.defaults({
          udid,
          noReset: true
        }, UICATALOG_SIM_CAPS);

        (await simBooted(sim)).should.be.true;
        let simsBefore = await getNumSims();
        await driver.init(caps);
        let simsDuring = await getNumSims();
        await driver.quit();
        let simsAfter = await getNumSims();
        (await simBooted(sim)).should.be.true;

        simsDuring.should.equal(simsBefore);
        simsAfter.should.equal(simsBefore);

        // cleanup
        await sim.shutdown();
        await deleteDevice(udid);
      });

      it('with invalid udid: throws an error', async () => {
        // test
        let caps = _.defaults({
          udid: 'some-random-udid'
        }, UICATALOG_SIM_CAPS);

        await driver.init(caps).should.be.rejectedWith('environment you requested was unavailable');
      });

      it('with non-existent udid: throws an error', async () => {
        // test
        let udid = 'a77841db006fb1762fee0bb6a2477b2b3e1cfa7d';
        let caps = _.defaults({udid}, UICATALOG_SIM_CAPS);

        await driver.init(caps).should.be.rejectedWith('environment you requested was unavailable');
      });

      it('with noReset set to true: leaves sim booted', async function () {
        this.timeout(MOCHA_TIMEOUT);

        // before
        let udid = await createDevice('webDriverAgentTest', 'iPhone 6', UICATALOG_SIM_CAPS.platformVersion);
        let sim = await getSimulator(udid);

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
        (await simBooted(sim)).should.be.true;

        simsDuring.should.equal(simsBefore);
        simsAfter.should.equal(simsBefore);

        // cleanup
        await sim.shutdown();
        await deleteDevice(udid);
      });
    });

    describe('event timings', () => {
      it('should include event timings if cap is used', async () => {
        let newCaps = Object.assign({}, UICATALOG_SIM_CAPS, {eventTimings: true});
        await driver.init(newCaps);
        let res = await driver.sessionCapabilities();
        should.exist(res.events);
        should.exist(res.events.newSessionStarted);
        res.events.newSessionStarted[0].should.be.above(res.events.newSessionRequested[0]);
      });
    });
  } else {
    // real device tests
    describe('handle multiple back-to-back sessions', () => {
      it('should not fail when the new session is initiated', async () => {
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
