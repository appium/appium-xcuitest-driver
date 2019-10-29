import wd from 'wd';
import request from 'request-promise';
import { startServer } from '../../..';
import { util, logger } from 'appium-support';
import patchDriverWithEvents from './ci-metrics';
import _ from 'lodash';

const testSetupLog = logger.getLogger('TEST_SETUP');

const {REMOTE, CI_METRICS} = process.env;

// if we are tracking CI metrics, patch the wd framework
if (CI_METRICS) {
  patchDriverWithEvents();
}

function getHost () {
  if (process.env.HOST) {
    return process.env.HOST;
  }
  return process.env.REAL_DEVICE ? util.localIp() : 'localhost';
}

const HOST = getHost();
const PORT = process.env.PORT || 4994;
// on CI the timeout needs to be long, mostly so WDA can be built the first time
const MOCHA_TIMEOUT = 60 * 1000 * (process.env.CI ? 0 : 4);
const WDA_PORT = 8200;

let driver, server;

if (REMOTE) {
  before(function () {
    process.env.SAUCE_JOB_NAME = `${process.env.TRAVIS_JOB_NUMBER || 'Suite'}: ${this.test.parent.suites[0].title}`;
  });

  // on Sauce Labs we need to track the status of the job
  afterEach(function () {
    if (driver) {
      let fullTitle;
      if (!driver.name) {
        // traverse the title tree to get the whole thing
        let titles = [];
        const currentTest = this.currentTest;
        titles.push(currentTest.title);
        let parent = currentTest.parent;
        while (parent) {
          if (parent.title) {
            titles.push(parent.title);
          }
          parent = parent.parent;
        }
        fullTitle = titles.reverse().join('/');

        // construct the name for the job
        driver.name = `${process.env.TRAVIS_JOB_NUMBER || 'Suite'}: ${_.first(titles)}`;
      }

      // check for the first failure
      if (!driver.errored && this.currentTest.state !== 'passed') {
        // add the first failed job title to the name of the job
        driver.name += ` (${fullTitle})`;
        // and fail the whole job
        driver.errored = true;
      }
    }

    // wd puts info into the error object that mocha can't display easily
    if (this.currentTest.err) {
      console.error('ERROR:', JSON.stringify(this.currentTest.err, null, 2)); // eslint-disable-line
    }
  });
}

async function initDriver () { // eslint-disable-line require-await
  const appiumUrl = process.env.APPIUM_URL || `http://${HOST}:${PORT}/wd/hub`;
  testSetupLog.info(`Starting session at '${appiumUrl}'`);
  driver = await wd.promiseChainRemote(appiumUrl);
  driver.name = undefined;
  driver.errored = false;
  return driver;
}

async function initServer () {
  server = await startServer(PORT, HOST);
}

function getServer () {
  return server;
}

async function initWDA (caps) {
  // first, see if this is necessary
  try {
    await request.get({url: `http://${HOST}:${WDA_PORT}/status`});
  } catch (err) {
    // easiest way to initialize WDA is to go through a test startup
    // otherwise every change to the system would require a change here
    const desiredCaps = Object.assign({
      autoLaunch: false,
      wdaLocalPort: WDA_PORT,
    }, caps);
    await driver.init(desiredCaps);
    await driver.quit();
  }
}

async function initSession (caps) {
  if (!REMOTE) {
    await initServer();
  } else {
    // on cloud tests, we want to set the `name` capability
    if (!caps.name) {
      caps.name = process.env.SAUCE_JOB_NAME || process.env.TRAVIS_JOB_NUMBER || 'unnamed';
    }
  }

  await initDriver();

  if (process.env.USE_WEBDRIVERAGENTURL) {
    await initWDA(caps);
    caps = Object.assign({
      webDriverAgentUrl: `http://${HOST}:${WDA_PORT}`,
      wdaLocalPort: WDA_PORT,
    }, caps);
  }

  const serverRes = await driver.init(caps);
  if (!caps.udid && !caps.fullReset && serverRes[1].udid) {
    caps.udid = serverRes[1].udid;
  }

  return driver;
}

async function deleteSession () {
  try {
    if (process.env.REMOTE) {
      await driver.sauceJobUpdate({
        name: driver.name,
        passed: !driver.errored,
      });
    }
  } catch (ign) {}

  try {
    await driver.quit();
  } catch (ign) {
  } finally {
    driver = undefined;
  }

  try {
    await server.close();
  } catch (ign) {}
}

export { initDriver, initSession, deleteSession, getServer, HOST, PORT, MOCHA_TIMEOUT };
