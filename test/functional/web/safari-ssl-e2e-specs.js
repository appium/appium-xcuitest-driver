import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';
import _ from 'lodash';
import B from 'bluebird';
import { killAllSimulators } from 'appium-ios-simulator';
import { HOST, PORT, MOCHA_TIMEOUT } from '../helpers/session';
import { SAFARI_CAPS } from '../desired';
import { startServer } from '../../..';
import https from 'https';

const pem = B.promisifyAll(require('pem'));

chai.should();
chai.use(chaiAsPromised);

const HTTPS_PORT = 9762;

let caps = _.defaults({
  safariInitialUrl: `https://localhost:${HTTPS_PORT}/`,
  noReset: false,
}, SAFARI_CAPS);

let pemCertificate;


describe('Safari SSL', function () {
  this.timeout(MOCHA_TIMEOUT);

  let server, sslServer, driver;
  before(async function () {
    if (process.env.REAL_DEVICE) return this.skip(); // eslint-disable-line curly

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
    }).listen(HTTPS_PORT);
  });

  after(async function () {
    await server.close();
    await sslServer.close();
  });

  it('should open pages with untrusted certs if the cert was provided in desired capabilities', async function () {
    caps.customSSLCert = pemCertificate;
    await driver.init(caps);
    await driver.setPageLoadTimeout(3000);
    await driver.get(`https://localhost:${HTTPS_PORT}/`);
    let source = await driver.source();
    source.should.include('Arbitrary text');
    driver.quit();
    await B.delay(1000);

    // Now do another session using the same cert to verify that it still works
    await driver.init(caps);
    await driver.setPageLoadTimeout(3000);
    await driver.get(`https://localhost:${HTTPS_PORT}/`);
    source = await driver.source();
    source.should.include('Arbitrary text');
    await driver.quit();
  });
});
