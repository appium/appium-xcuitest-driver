import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';
import _ from 'lodash';
import B from 'bluebird';
import { killAllSimulators } from 'appium-ios-simulator';
import { HOST, PORT, MOCHA_TIMEOUT } from '../helpers/session';
import { SAFARI_CAPS, REAL_DEVICE } from '../desired';
import { startServer } from '../../..';
import https from 'https';

const pem = B.promisifyAll(require('pem'));

chai.should();
chai.use(chaiAsPromised);

let caps = _.defaults({
  safariInitialUrl: "https://localhost:9758/"
}, SAFARI_CAPS);

let pemCertificate;

describe('Safari SSL', function () {
  this.timeout(MOCHA_TIMEOUT);

  let server, sslServer, driver;
  before(async function () {
    if (REAL_DEVICE) return this.skip(); // eslint-disable-line curly

    await killAllSimulators();

    driver = wd.promiseChainRemote(HOST, PORT);
    server = await startServer(PORT, HOST);

    // Create a random pem certificate
    let privateKey = await pem.createPrivateKeyAsync();
    let keys = await pem.createCertificateAsync({days:1, selfSigned: true, serviceKey: privateKey.key});
    pemCertificate = keys.certificate;

    // Host an SSL server that uses that certificate
    const serverOpts = {key: keys.serviceKey, cert: pemCertificate};
    sslServer = https.createServer(serverOpts, (req, res) => {
      res.end('Arbitrary text');
    }).listen(9758);
  });

  after(async () => {
    if (server) {
      await server.close();
    }
    if (sslServer) {
      await sslServer.close();
    }
  });

  describe('ssl cert', () => {
    afterEach(async function () {
      if (driver) {
        await driver.quit();
      }
    });

    it('should open pages with untrusted certs if the cert was provided in desired capabilities', async function () {
      caps.customSSLCert = pemCertificate;
      await driver.init(caps);
      await driver.setPageLoadTimeout(3000);
      await driver.get('https://localhost:9758/');
      let source = await driver.source();
      source.should.include('Arbitrary text');
      driver.quit();
    });
  });
});
