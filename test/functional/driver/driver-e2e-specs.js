import { startServer } from '../../..';
import { simBooted } from '../../../lib/simulatorManagement.js';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';
import { killAllSimulators, getSimulator } from 'appium-ios-simulator';
import { getDevices, createDevice, deleteDevice } from 'node-simctl';
import _ from 'lodash';
import { HOST, PORT } from '../helpers/session';
import { TESTAPP_SIM_CAPS } from '../desired';


chai.should();
chai.use(chaiAsPromised);

let getNumSims = async () => {
  return (await getDevices())[TESTAPP_SIM_CAPS.platformVersion].length;
};

describe('XCUITestDriver', () => {
  let server, driver;
  before(async () => {
    await killAllSimulators();
    
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

  it('should start and stop a session', async function () {
    this.timeout(200 * 1000);
    await driver.init(TESTAPP_SIM_CAPS);
    let els = await driver.elementsByClassName("XCUIElementTypeButton");
    els.length.should.be.at.least(4);
    await driver.quit();
  });

  describe('reset', () => {
    it.skip('default: creates sim and deletes it afterwards', async function () {
      this.timeout(120 * 1000);
      let caps = TESTAPP_SIM_CAPS;

      await killAllSimulators();
      let simsBefore = await getNumSims();
      await driver.init(caps);

      let simsDuring = await getNumSims();

      await driver.quit();
      let simsAfter = await getNumSims();

      simsDuring.should.equal(simsBefore + 1);
      simsAfter.should.equal(simsBefore);
    });

    it('with udid: uses sim and shuts it down afterwards', async function () {
      this.timeout(120 * 1000);

      // before
      let udid = await createDevice('webDriverAgentTest', 'iPhone 6', TESTAPP_SIM_CAPS.platformVersion);
      let sim = await getSimulator(udid);

      // test
      let caps = _.defaults({
        udid
      }, TESTAPP_SIM_CAPS);

      let simsBefore = await getNumSims();
      await driver.init(caps);
      let simsDuring = await getNumSims();
      await driver.quit();
      let simsAfter = await getNumSims();
      (await simBooted(sim)).should.be.false;

      simsDuring.should.equal(simsBefore);
      simsAfter.should.equal(simsBefore);

      // cleanup
      await deleteDevice(udid);
    });

    it('with udid booted: uses sim and leaves it afterwards', async function () {
      this.timeout(120 * 1000);

      // before
      let udid = await createDevice('webDriverAgentTest', 'iPhone 6', TESTAPP_SIM_CAPS.platformVersion);
      let sim = await getSimulator(udid);
      await sim.run();

      // test
      let caps = _.defaults({
        udid
      }, TESTAPP_SIM_CAPS);

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

    it('with invalid udid: throws an error', async function () {
      this.timeout(120 * 1000);

      // test
      let caps = _.defaults({
        udid: 'some-random-udid'
      }, TESTAPP_SIM_CAPS);

      await driver.init(caps).should.be.rejectedWith('environment you requested was unavailable');
    });

    it('with non-existent udid: throws an error', async function () {
      this.timeout(120 * 1000);

      // test
      let udid = 'a77841db006fb1762fee0bb6a2477b2b3e1cfa7d';
      let caps = _.defaults({udid}, TESTAPP_SIM_CAPS);

      await driver.init(caps).should.be.rejectedWith('environment you requested was unavailable');
    });

    it('with noReset set to true: leaves sim booted', async function () {
      this.timeout(120 * 1000);

      // before
      let udid = await createDevice('webDriverAgentTest', 'iPhone 6', TESTAPP_SIM_CAPS.platformVersion);
      let sim = await getSimulator(udid);

      // test
      let caps = _.defaults({
        udid,
        noReset: true
      }, TESTAPP_SIM_CAPS);

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
});
