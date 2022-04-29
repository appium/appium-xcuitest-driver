import { remote } from 'webdriverio';
import { startServer } from '../../..';

const HOST = '127.0.0.1';
const PORT = 4994;
// on CI the timeout needs to be long, mostly so WDA can be built the first time
const MOCHA_TIMEOUT = 60 * 1000 * (process.env.CI ? 0 : 4);

let driver, server;

function getServer () {
  return server;
}

async function initSession (caps) {
  server = await startServer(PORT, HOST);

  driver = await remote({
    hostname: HOST,
    port: PORT,
    capabilities: caps,
  });
  driver.name = undefined;
  driver.errored = false;
  return driver;
}

async function deleteSession () {
  try {
    await driver.deleteSession();
  } catch (ign) {
  } finally {
    driver = undefined;
  }

  try {
    await server.close();
  } catch (ign) {
  } finally {
    server = undefined;
  }
}

export { initSession, deleteSession, getServer, HOST, PORT, MOCHA_TIMEOUT };
