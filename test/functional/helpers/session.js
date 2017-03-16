import wd from 'wd';
import { startServer } from '../../..';
import request from 'request-promise';


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

  // TODO: Get rid of this monkey patch once https://github.com/admc/wd/pull/468 is committed
  driver.toggleTouchIdEnrollment = async function () {
    let sessionId = driver.sessionID;
    return JSON.parse(await request.post(`http://0.0.0.0:4994/wd/hub/session/${sessionId}/appium/simulator/toggle_touch_id_enrollment`));
  };

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
