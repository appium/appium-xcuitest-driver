import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import B from 'bluebird';
import { killAllSimulators } from '../helpers/simulator';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { SAFARI_CAPS } from '../desired';
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

  let sslServer, driver;
  before(async function () {
    if (process.env.REAL_DEVICE) return this.skip(); // eslint-disable-line curly

    await killAllSimulators();

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
    await deleteSession();
    await sslServer.close();
  });

  it('should open pages with untrusted certs if the cert was provided in desired capabilities', async function () {
    caps.customSSLCert = pemCertificate;
    driver = await initSession(caps);
    await driver.get(`https://localhost:${HTTPS_PORT}/`);
    let source = await driver.source();
    source.should.include('Arbitrary text');
    await driver.quit();
    await B.delay(1000);

    // Now do another session using the same cert to verify that it still works
    await driver.init(caps);
    await driver.get(`https://localhost:${HTTPS_PORT}/`);
    source = await driver.source();
    source.should.include('Arbitrary text');
  });
});
