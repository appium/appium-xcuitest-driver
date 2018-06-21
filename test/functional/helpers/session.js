import wd from 'wd';
import request from 'request-promise';
import { startServer } from '../../..';
import { util } from 'appium-support';
import patchDriverWithEvents from './ci-metrics';

const {SAUCE_RDC, SAUCE_EMUSIM, CLOUD} = process.env;

// if we are tracking CI metrics, patch the wd framework
if (process.env.CI_METRICS) {
  patchDriverWithEvents();
}

function getPort () {
  if (SAUCE_EMUSIM) {
    return 80;
  } else if (SAUCE_RDC) {
    // TODO: Add this later
  }
  return 4994;
}

function getHost () {
  if (SAUCE_EMUSIM) {
    return 'ondemand.saucelabs.com';
  } else if (SAUCE_RDC) {
    // TODO: Add this later
  }

  return process.env.REAL_DEVICE ? util.localIp() : 'localhost';
}

const HOST = getHost();
const PORT = getPort();
const MOCHA_TIMEOUT = 60 * 1000 * (process.env.CI ? 8 : 4);
const WDA_PORT = 8200;

let driver, server;

async function initDriver () {
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
  try {
    await driver.quit();
  } catch (ign) {}
  try {
    await server.close();
  } catch (ign) {}
}

export { initDriver, initSession, deleteSession, getServer, HOST, PORT, MOCHA_TIMEOUT };
