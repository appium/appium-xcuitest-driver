import wd from 'wd';
import { startServer } from '../../..';


const HOST = '0.0.0.0',
      PORT = 4994;
const MOCHA_TIMEOUT = 60 * 1000 * (process.env.TRAVIS ? 8 : 4);

let driver, server;

async function initDriver () {
  driver = wd.promiseChainRemote(HOST, PORT);
  server = await startServer(PORT, HOST);

  return driver;
}

async function initSession (caps) {
  await initDriver();
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

export { initDriver, initSession, deleteSession, HOST, PORT, MOCHA_TIMEOUT };
