import chai from 'chai';
import os from 'os';
import https from 'https';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import { MOCHA_TIMEOUT, initSession, deleteSession, hasDefaultPrebuiltWDA } from '../helpers/session';
import {
  doesIncludeCookie, doesNotIncludeCookie, newCookie, oldCookie1
} from './helpers';
import { SAFARI_CAPS, amendCapabilities } from '../desired';


const pem = B.promisifyAll(require('pem'));

chai.should();
chai.use(chaiAsPromised);

const HTTPS_PORT = 9762;

const LOCAL_HTTPS_URL = `https://localhost:${HTTPS_PORT}/`;

let caps;
let pemCertificate;

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

     caps = amendCapabilities(SAFARI_CAPS, {
       'appium:safariInitialUrl': LOCAL_HTTPS_URL,
       'appium:noReset': true,
       'appium:customSSLCert': pemCertificate + os.EOL,
       'appium:usePrebuiltWDA': hasDefaultPrebuiltWDA(),
     });
   });
   after(async function () {
     await deleteSession();
     if (sslServer) {
       await sslServer.close();
     }
   });

   it('should open pages with untrusted certs if the cert was provided in desired capabilities', async function () {
     try {
       driver = await initSession(caps);
       await driver.getPageSource().should.eventually.include('Arbitrary text');
       await deleteSession();
       await B.delay(1000);

       // Now do another session using the same cert to verify that it still works
       // (Don't do it on CLOUD. Restarting is too slow)
       if (!process.env.CLOUD) {
         driver = await initSession(caps);
         await driver.url(LOCAL_HTTPS_URL);
         await driver.getPageSource().should.eventually.include('Arbitrary text');
       }
     } finally {
       await deleteSession();
     }
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
       await driver.url(LOCAL_HTTPS_URL);
       await driver.setCookies([oldCookie1]);
       await driver.deleteCookie(secureCookie.name);
     });

     it('should be able to set a secure cookie', async function () {
       let cookies = await driver.getCookies();
       doesNotIncludeCookie(cookies, secureCookie);

       await driver.setCookies([secureCookie]);

       cookies = await driver.getCookies();
       doesIncludeCookie(cookies, secureCookie);
     });

     it('should not delete an old cookie after setting a secure cookie', async function () {
       let cookies = await driver.getCookies();
       doesIncludeCookie(cookies, oldCookie1);

       await driver.setCookies([secureCookie]);

       cookies = await driver.getCookies();
       doesIncludeCookie(cookies, oldCookie1);
     });

     it('should be able to delete a secure cookie', async function () {
       await driver.setCookies([secureCookie]);
       let cookies = await driver.getCookies();
       doesIncludeCookie(cookies, secureCookie);

       await driver.deleteCookie(secureCookie.name);

       cookies = await driver.getCookies();
       doesNotIncludeCookie(cookies, secureCookie);
     });

     it('should not delete a cookie after deleting a secure cookie', async function () {
       await driver.setCookies([secureCookie]);
       let cookies = await driver.getCookies();
       doesIncludeCookie(cookies, oldCookie1);

       await driver.deleteCookie(secureCookie.name);

       cookies = await driver.getCookies();
       doesIncludeCookie(cookies, oldCookie1);
     });
   });
 });
