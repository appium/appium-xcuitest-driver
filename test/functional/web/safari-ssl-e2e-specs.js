import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import B from 'bluebird';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { doesIncludeCookie, doesNotIncludeCookie,
         newCookie, oldCookie1 } from './safari-basic-e2e-specs';
import { SAFARI_CAPS } from '../desired';
import https from 'https';


const pem = B.promisifyAll(require('pem'));

chai.should();
chai.use(chaiAsPromised);

const HTTPS_PORT = 9762;

const LOCAL_HTTPS_URL = `https://localhost:${HTTPS_PORT}/`;

const caps = _.defaults({
  safariInitialUrl: LOCAL_HTTPS_URL,
  noReset: true,
}, SAFARI_CAPS);

let pemCertificate;

if (!process.env.REAL_DEVICE && !process.env.CLOUD) {
  describe('Safari SSL', function () {
    this.timeout(MOCHA_TIMEOUT);

    let sslServer, driver;
    before(async function () {
      // Create a random pem certificate
      const privateKey = await pem.createPrivateKeyAsync();
      const keys = await pem.createCertificateAsync({
        days: 1,
        selfSigned: true,
        serviceKey: privateKey.key,
        altNames: ['localhost'],
      });
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
      if (sslServer) {
        await sslServer.close();
      }
    });

    it('should open pages with untrusted certs if the cert was provided in desired capabilities', async function () {
      driver = await initSession(caps);
      await driver.get(LOCAL_HTTPS_URL);
      await driver.source().should.eventually.include('Arbitrary text');
      await driver.quit();
      await B.delay(1000);

      // Now do another session using the same cert to verify that it still works
      // (Don't do it on CLOUD. Restarting is too slow)
      if (!process.env.CLOUD) {
        await driver.init(caps);
        await driver.get(LOCAL_HTTPS_URL);
        await driver.source().should.eventually.include('Arbitrary text');
      }

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
}
