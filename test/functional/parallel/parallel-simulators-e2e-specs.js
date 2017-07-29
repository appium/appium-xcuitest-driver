import chai from 'chai';
import wd from 'wd';
import chaiAsPromised from 'chai-as-promised';
import { HOST, PORT, MOCHA_TIMEOUT } from '../helpers/session';
import { UICATALOG_CAPS } from '../desired';
import { startServer } from '../../..';

chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - parallel Simulators', function () {
  this.timeout(MOCHA_TIMEOUT);

  let drivers = [];
  let server;
  const DEFAULT_WDA_PORT = 8100;
  const DEFAULT_PLATFORM_VERSION = '11.0';
  before(async () => {
    server = await startServer(PORT, HOST);
  });
  after(async () => {
    while (drivers.length) {
      const drv = drivers.shift();
      try {
        await drv.quit();
      } catch (ign) {}
    }
    try {
      await server.close();
    } catch (ign) {}
  });

  describe('sessions initialization', () => {
    const ALL_DEVICES = ['iPhone 6', 'iPhone 6s', 'iPhone 7'];

    after(async () => {
      while (drivers.length) {
        const drv = drivers.shift();
        try {
          await drv.quit();
        } catch (ign) {}
      }
    });

    it('should start parallel sessions and return WDA status for each of them', async () => {
      const initPromises = [];
      let wdaPort = DEFAULT_WDA_PORT;
      for (const name of ALL_DEVICES.slice(0, 2)) {
        const drv = wd.promiseChainRemote(HOST, PORT);
        drivers.push(drv);
        const caps = Object.assign({}, UICATALOG_CAPS, {
          deviceName: name,
          wdaLocalPort: wdaPort++,
          platformVersion: DEFAULT_PLATFORM_VERSION,
        });
        initPromises.push(drv.init(caps));
      }
      for (const initPromise of initPromises) {
        await initPromise;
      }
      for (const drv of drivers) {
        const status = await drv.status();
        status.wda.should.exist;
      }
    });
  });
});
