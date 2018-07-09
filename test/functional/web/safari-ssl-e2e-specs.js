import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import B from 'bluebird';
import { killAllSimulators } from '../helpers/simulator';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { doesIncludeCookie, doesNotIncludeCookie,
         newCookie, oldCookie1 } from './safari-cookie-e2e-specs';
import { SAFARI_CAPS } from '../desired';
import https from 'https';


const pem = B.promisifyAll(require('pem'));

chai.should();
chai.use(chaiAsPromised);

const HTTPS_PORT = 9762;

const LOCAL_HTTPS_URL = `https://localhost:${HTTPS_PORT}/`;

let caps = _.defaults({
  safariInitialUrl: LOCAL_HTTPS_URL,
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

    caps.customSSLCert = pemCertificate;
  });
  after(async function () {
    await deleteSession();
    await sslServer.close();
  });

  it('should open pages with untrusted certs if the cert was provided in desired capabilities', async function () {
    driver = await initSession(caps);
    await driver.get(LOCAL_HTTPS_URL);
    let source = await driver.source();
    source.should.include('Arbitrary text');
    await driver.quit();
    await B.delay(1000);

    // Now do another session using the same cert to verify that it still works
    await driver.init(caps);
    await driver.get(LOCAL_HTTPS_URL);
    source = await driver.source();
    source.should.include('Arbitrary text');

    await deleteSession();
  });

  describe('cookies', function () {
    const secureCookie = Object.assign({}, newCookie, {
      secure: true,
      name: 'securecookie',
      value: 'this is a secure cookie',
    });

    before(async function () {
      driver = await initSession(caps);
    });

    beforeEach(async function () {
      await driver.get(LOCAL_HTTPS_URL);
      await driver.setCookie(oldCookie1);
      await driver.deleteCookie(secureCookie.name);
    });

    it('should be able to set a secure cookie', async function () {
      let cookies = await driver.allCookies();
      doesNotIncludeCookie(cookies, secureCookie);

      await driver.setCookie(secureCookie);
      cookies = await driver.allCookies();

      doesIncludeCookie(cookies, secureCookie);

      // should not clobber old cookie
      doesIncludeCookie(cookies, oldCookie1);
    });
    it('should be able to set a secure cookie', async function () {
      await driver.setCookie(secureCookie);
      let cookies = await driver.allCookies();

      doesIncludeCookie(cookies, secureCookie);

      // should not clobber old cookie
      doesIncludeCookie(cookies, oldCookie1);

      await driver.deleteCookie(secureCookie.name);

      cookies = await driver.allCookies();
      doesNotIncludeCookie(cookies, secureCookie);
    });
  });
});
