import chai from 'chai';
import wd from 'wd';
import _ from 'lodash';
import chaiAsPromised from 'chai-as-promised';
import { PORT, MOCHA_TIMEOUT } from '../helpers/session';
import { UICATALOG_CAPS } from '../desired';
import { startServer } from '../../..';

chai.should();
chai.use(chaiAsPromised);

async function resetMapping (mapping) {
  for (const [server, driver] of mapping.entries()) {
    try {
      if (driver) {
        await driver.quit();
      }
    } catch (ign) {}
    try {
      await server.close();
    } catch (ign) {}
  }
  mapping.clear();
}

// skip tests in Travis, because they're unstable due to slowness
describe('XCUITestDriver - parallel Simulators @skip-ci', function () {
  this.timeout(MOCHA_TIMEOUT);

  const sessionsMapping = new Map();
  const DEFAULT_WDA_PORT = 8100;
  const DEFAULT_SERVER_PORT = PORT;
  const DEVICES = ['iPhone 6', 'iPhone 6s'];
  const HOST = '127.0.0.1';

  after(async function () {
    await resetMapping(sessionsMapping);
  });

  describe('sessions initialization', function () {
    const SESSIONS_COUNT = DEVICES.length;

    after(async function () {
      await resetMapping(sessionsMapping);
    });

    it('should start parallel sessions and return WDA status for each of them', async function () {
      const sessionsPromisesMapping = new Map();
      for (const [devName, serverPort, wdaPort] of _.zip(DEVICES.slice(0, SESSIONS_COUNT),
                                                         _.range(DEFAULT_SERVER_PORT, DEFAULT_SERVER_PORT + SESSIONS_COUNT),
                                                         _.range(DEFAULT_WDA_PORT, DEFAULT_WDA_PORT + SESSIONS_COUNT))) {
        const driverPromise = wd.promiseChainRemote(HOST, serverPort);
        const serverPromise = startServer(serverPort, HOST);
        const caps = Object.assign({}, UICATALOG_CAPS, {
          deviceName: devName,
          wdaLocalPort: wdaPort,
        });
        sessionsPromisesMapping.set(serverPromise, [driverPromise, caps]);
      }
      const initPromisesMapping = new Map();
      for (const [sessionPromise, driverPromiseInfo] of sessionsPromisesMapping.entries()) {
        const [driverPromise, caps] = driverPromiseInfo;
        const session = await sessionPromise;
        const driver = await driverPromise;
        sessionsMapping.set(session, driver);
        initPromisesMapping.set(driver, driver.init(caps));
      }
      for (const [driver, initPromise] of initPromisesMapping.entries()) {
        await initPromise;
        const status = await driver.status();
        status.wda.should.exist;
      }
    });
  });
});
