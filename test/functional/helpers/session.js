import wd from 'wd';
import request from 'request-promise';
import { startServer } from '../../..';
import { util } from 'appium-support';
import patchDriverWithEvents from './ci-metrics';
import SauceLabs from 'saucelabs';
import B from 'bluebird';


const {SAUCE_RDC, SAUCE_EMUSIM, CLOUD, CI_METRICS} = process.env;

// if we are tracking CI metrics, patch the wd framework
if (CI_METRICS) {
  patchDriverWithEvents();
}

function getPort () {
  if (SAUCE_EMUSIM || SAUCE_RDC) {
    return 80;
  }
  return 4994;
}

function getHost () {
  if (SAUCE_RDC) {
    return 'appium.staging.testobject.org';
  } else if (SAUCE_EMUSIM) {
    return 'ondemand.saucelabs.com';
  }

  return process.env.REAL_DEVICE ? util.localIp() : 'localhost';
}

const HOST = getHost();
const PORT = getPort();
// on CI the timeout needs to be long, mostly so WDA can be built the first time
const MOCHA_TIMEOUT = 60 * 1000 * (process.env.CI ? 32 : 4);
const WDA_PORT = 8200;

let driver, server;

let updateSauceJob;
if (process.env.CLOUD) {
  if (process.env.CLOUD) {
    const sauceUserName = process.env.SAUCE_USERNAME;
    const sauceAccessKey = process.env.SAUCE_ACCESS_KEY;
    if (sauceUserName && sauceAccessKey) {
      const saucelabs = new SauceLabs({
        username: sauceUserName,
        password: sauceAccessKey,
      });
      updateSauceJob = B.promisify(saucelabs.updateJob, {context: saucelabs});
    }
  }

  // on Sauce Labs we need to track the status of the job, and a reasonable
  // name for it
  afterEach(function () {
    const passed = this.currentTest.state === 'passed';
    if (driver) {
      // if we haven't already failed the suite, update with the current test
      if (driver._appiumSuccess !== false) {
        driver._appiumSuccess = passed;
      }
      // add a title, if it is not already added
      if (!driver._appiumTitle) {
        if (this.test.parent.suites.length) {
          driver._appiumTitle = `${process.env.TRAVIS_JOB_NUMBER}: ${this.test.parent.suites[0].title}`;
        }
      }
    }

    // wd puts info into the error object that mocha can't display easily
    if (this.currentTest.err) {
      console.log('ERROR:', JSON.stringify(this.currentTest.err, 2)); // eslint-disable-line
    }
  });
}

async function initDriver () { // eslint-disable-line require-await
  driver = wd.promiseChainRemote(HOST, PORT);
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
  if (!CLOUD) {
    await initServer();
  }
  await initDriver();

  if (process.env.USE_WEBDRIVERAGENTURL) {
    await initWDA(caps);
    caps = Object.assign({
      webDriverAgentUrl: `http://${HOST}:${WDA_PORT}`,
      wdaLocalPort: WDA_PORT,
    }, caps);
  }

  let serverRes = await driver.init(caps);
  if (!caps.udid && !caps.fullReset && serverRes[1].udid) {
    caps.udid = serverRes[1].udid;
  }

  await driver.setImplicitWaitTimeout(5000);

  return driver;
}

async function deleteSession () {
  // for Sause Labs jobs, update the server
  if (updateSauceJob && driver) {
    updateSauceJob(driver.sessionID, {
      passed: !!driver._appiumSuccess,
      name: driver._appiumTitle,
    });
  }

  try {
    await driver.quit();
  } catch (ign) {}
  try {
    await server.close();
  } catch (ign) {}
}

export { initDriver, initSession, deleteSession, getServer, HOST, PORT, MOCHA_TIMEOUT };
