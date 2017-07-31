import chai from 'chai';
import wd from 'wd';
import _ from 'lodash';
import B from 'bluebird';
import chaiAsPromised from 'chai-as-promised';
import { HOST, PORT, MOCHA_TIMEOUT } from '../helpers/session';
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

describe('XCUITestDriver - parallel Simulators', function () {
  this.timeout(MOCHA_TIMEOUT);

  const sessionsMapping = new Map();
  const DEFAULT_WDA_PORT = 8100;
  const DEFAULT_SERVER_PORT = PORT;
  const DEFAULT_PLATFORM_VERSION = '11.0';
  const DEVICES = ['iPhone 6', 'iPhone 6s'];

  after(async () => {
    await resetMapping(sessionsMapping);
  });

  describe('sessions initialization', () => {
    const SESSIONS_COUNT = DEVICES.length;

    before(async () => {
      const serverPromises = [];
      for (const portNumber of _.range(DEFAULT_SERVER_PORT, DEFAULT_SERVER_PORT + SESSIONS_COUNT)) {
        serverPromises.push(startServer(portNumber, HOST));
      }
      const servers = await B.all(serverPromises);
      servers.map((s) => sessionsMapping.set(s, null));
    });
    after(async () => {
      await resetMapping(sessionsMapping);
    });

    it('should start parallel sessions and return WDA status for each of them', async () => {
      const initPromises = [];
      for (const [devName, server, serverPort, wdaPort] of _.zip(DEVICES.slice(0, SESSIONS_COUNT)),
                                                                 sessionsMapping.keys(),
                                                                 _.range(DEFAULT_SERVER_PORT, DEFAULT_SERVER_PORT + SESSIONS_COUNT),
                                                                 _.range(DEFAULT_WDA_PORT, DEFAULT_WDA_PORT + SESSIONS_COUNT)) {
        const drv = wd.promiseChainRemote(HOST, serverPort);
        sessionsMapping.set(server, drv);
        const caps = Object.assign({}, UICATALOG_CAPS, {
          deviceName: devName,
          wdaLocalPort: wdaPort,
          platformVersion: DEFAULT_PLATFORM_VERSION,
        });
        initPromises.push(drv.init(caps));
      }
      await B.all(initPromises);
      for (const drv of sessionsMapping.values()) {
        const status = await drv.status();
        status.wda.should.exist;
      }
    });
  });
});
