import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';
import _ from 'lodash';
import B from 'bluebird';
import { killAllSimulators } from 'appium-ios-simulator';
import { HOST, PORT } from '../helpers/session';
import { SAFARI_CAPS } from '../desired';
import https from 'https';

const pem = B.promisifyAll(require('pem'));

chai.should();
chai.use(chaiAsPromised);

let caps = _.defaults({
  safariInitialUrl: "https://localhost:9758/"
}, SAFARI_CAPS);

let pemCertificate;

describe('Safari SSL', function () {
  this.timeout(4 * 60 * 1000);

  let server, driver;
  before(async () => {
    await killAllSimulators();

    driver = wd.promiseChainRemote(HOST, PORT);

    // Create a random pem certificate
    let privateKey = await pem.createPrivateKeyAsync();
    let keys = await pem.createCertificateAsync({days:1, selfSigned: true, serviceKey: privateKey.key});
    pemCertificate = keys.certificate;

    // Host an SSL server that uses that certificate
    server = https.createServer({key: keys.serviceKey, cert: pemCertificate}, function (req, res){ 
      res.end('Arbitrary text');
    }).listen(9758);
  });

  after(async () => {
    await server.close();
  });

  describe('ssl cert', () => {
    afterEach(async function () {
      await driver.quit();
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
