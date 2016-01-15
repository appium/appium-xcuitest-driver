import { startServer } from '../..';
import { simBooted } from '../../lib/simulatorManagement.js';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { absolute } from 'ios-test-app';
import wd from 'wd';
import { killAllSimulators, getSimulator } from 'appium-ios-simulator';
import { getDevices, createDevice, deleteDevice } from 'node-simctl';

chai.should();
chai.use(chaiAsPromised);

const HOST = "localhost",
      PORT = 4994,
      APP = absolute.iphonesimulator,
      BUNDLE_ID = 'io.appium.TestApp',
      PLATFORM_VERSION = '9.2';

const DEFAULT_CAPS = {
  platformName: 'iOS',
  platformVersion: PLATFORM_VERSION,
  app: APP,
  bundleId: BUNDLE_ID,
  deviceName: "iPhone 6",
  automationName: "WebDriverAgent",
};

let getNumSims = async () => {
  return (await getDevices())[PLATFORM_VERSION].length;
};

describe('WebDriverAgentDriver', () => {
  let server;
  let driver = wd.promiseChainRemote(HOST, PORT);
  before(async () => {
    server = await startServer(PORT, HOST);
  });

  after(() => {
    // TODO I don't think this is actually shutting the server down, figure
    // that out
    server.close();
  });

  it('should start and stop a session', async function () {
    this.timeout(120 * 1000);
    await driver.init(DEFAULT_CAPS);
    let els = await driver.elementsByClassName("UIAButton");
    els.length.should.equal(7);
    await driver.quit();
  });

  describe('reset', () => {
    it('default: creates sim and deletes it afterwards', async function () {
      this.timeout(120 * 1000);
      let caps = {
        platformName: 'iOS',
        platformVersion: PLATFORM_VERSION,
        app: APP,
        bundleId: BUNDLE_ID,
        deviceName: "iPhone 6",
        automationName: "WebDriverAgent",
      };

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
      let udid = await createDevice('webDriverAgentTest', 'iPhone 6', PLATFORM_VERSION);

      // test
      let caps = {
        platformName: 'iOS',
        platformVersion: PLATFORM_VERSION,
        app: APP,
        bundleId: BUNDLE_ID,
        deviceName: "iPhone 6",
        automationName: "WebDriverAgent",
        udid: udid
      };

      let simsBefore = await getNumSims();
      await driver.init(caps);
      let simsDuring = await getNumSims();
      await driver.quit();
      let simsAfter = await getNumSims();
      (await simBooted(udid)).should.be.false;

      simsDuring.should.equal(simsBefore);
      simsAfter.should.equal(simsBefore);

      // cleanup
      await deleteDevice(udid);
    });

    it('with udid booted: uses sim and leaves it afterwards', async function () {
      this.timeout(120 * 1000);

      // before
      let udid = await createDevice('webDriverAgentTest', 'iPhone 6', PLATFORM_VERSION);
      let sim = await getSimulator(udid);
      await sim.run();

      // test
      let caps = {
        platformName: 'iOS',
        platformVersion: PLATFORM_VERSION,
        app: APP,
        bundleId: BUNDLE_ID,
        deviceName: "iPhone 6",
        automationName: "WebDriverAgent",
        udid: udid
      };

      (await simBooted(udid)).should.be.true;
      let simsBefore = await getNumSims();
      await driver.init(caps);
      let simsDuring = await getNumSims();
      await driver.quit();
      let simsAfter = await getNumSims();
      (await simBooted(udid)).should.be.true;

      simsDuring.should.equal(simsBefore);
      simsAfter.should.equal(simsBefore);

      // cleanup
      await sim.shutdown();
      await deleteDevice(udid);
    });

    it('with invalid udid: throws an error', async function () {
      this.timeout(120 * 1000);

      // test
      let caps = {
        platformName: 'iOS',
        platformVersion: PLATFORM_VERSION,
        app: APP,
        bundleId: BUNDLE_ID,
        deviceName: "iPhone 6",
        automationName: "WebDriverAgent",
        udid: 'some-random-udid'
      };

      await driver.init(caps).should.be.rejectedWith('environment you requested was unavailable');
    });

    it('with noReset set to true: leaves sim booted', async function () {
      this.timeout(120 * 1000);

      // before
      let udid = await createDevice('webDriverAgentTest', 'iPhone 6', PLATFORM_VERSION);
      let sim = await getSimulator(udid);

      // test
      let caps = {
        platformName: 'iOS',
        platformVersion: PLATFORM_VERSION,
        app: APP,
        bundleId: BUNDLE_ID,
        deviceName: "iPhone 6",
        automationName: "WebDriverAgent",
        udid: udid,
        noReset: true
      };

      let simsBefore = await getNumSims();
      await driver.init(caps);
      let simsDuring = await getNumSims();
      await driver.quit();
      let simsAfter = await getNumSims();
      (await simBooted(udid)).should.be.true;

      simsDuring.should.equal(simsBefore);
      simsAfter.should.equal(simsBefore);

      // cleanup
      await sim.shutdown();
      await deleteDevice(udid);
    });

  });

});
