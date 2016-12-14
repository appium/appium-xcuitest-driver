import wd from 'wd';
import { startServer } from '../../..';


const HOST = '0.0.0.0',
      PORT = 4994;

let driver, server;

async function initDriver () {
  driver = wd.promiseChainRemote(HOST, PORT);
  server = await startServer(PORT, HOST);

  return driver;
}

async function initSession (caps) {
  await initDriver();
  await driver.init(caps);

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

export { initDriver, initSession, deleteSession, HOST, PORT };
