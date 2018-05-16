import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { retryInterval } from 'asyncbox';
import { getSimulator } from 'appium-ios-simulator';
import { shutdownSimulator } from '../helpers/simulator';
import { createDevice, deleteDevice } from 'node-simctl';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { UICATALOG_SIM_CAPS } from '../desired';
import path from 'path';
import fs from 'fs';


const SIM_DEVICE_NAME = 'xcuitestDriverTest';
const TEMP_FOLDER = "/tmp/WebDriverAgent";

const should = chai.should(); // eslint-disable-line no-unused-vars
chai.use(chaiAsPromised);

const deleteDeviceWithRetry = async function (udid) {
  try {
    await retryInterval(10, 1000, deleteDevice, udid);
  } catch (ign) {}
};

describe('XCUITestDriver', function () {
  this.timeout(MOCHA_TIMEOUT);

  let baseCaps;
  let caps;

  let driver;
  before(async function () {
    const udid = await createDevice(SIM_DEVICE_NAME,
      UICATALOG_SIM_CAPS.deviceName, UICATALOG_SIM_CAPS.platformVersion);
    baseCaps = Object.assign({}, UICATALOG_SIM_CAPS, {udid});
    caps = Object.assign({
      usePrebuiltWDA: true,
      agentPath: path.join(TEMP_FOLDER, "WebDriverAgent.xcodeproj"),
      derivedDataPath: path.join(TEMP_FOLDER, "DerivedData", "WebDriverAgent")
    }, baseCaps);
    // copy existing WebDriverAgent to the selected derivedDataPath folder
    const wda_path = path.join(process.cwd(), "WebDriverAgent");
    fs.symlinkSync(wda_path, TEMP_FOLDER);
  });
  after(async function () {
    const sim = await getSimulator(caps.udid);
    await shutdownSimulator(sim);
    await deleteDeviceWithRetry(caps.udid);
    // delete created tmp folder
    fs.unlinkSync(TEMP_FOLDER);
  });

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    await deleteSession();
  });

  if (!process.env.REAL_DEVICE) {
    it.skip('should start and stop a session', async function () {
      driver = await initSession(caps);
      let els = await driver.elementsByClassName("XCUIElementTypeWindow");
      els.length.should.be.at.least(1);
    });
  }
});
