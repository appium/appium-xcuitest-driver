import wd from 'wd';
import { startServer } from '../../..';


const HOST = "localhost",
      PORT = 4994;

let driver, server;

async function initSession (caps) {
  driver = wd.promiseChainRemote(HOST, PORT);
  server = await startServer(PORT, HOST);
  await driver.init(caps);

  return driver;
}

async function deleteSession () {
  await driver.quit();
  await server.close();
}

export { initSession, deleteSession, HOST, PORT };
