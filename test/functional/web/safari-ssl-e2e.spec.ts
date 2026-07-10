import https from 'node:https';
import os from 'node:os';
import {describe, it, before, after, beforeEach} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify} from 'node:util';

import {waitForCondition} from 'asyncbox';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _pem from 'pem';
import type {Browser} from 'webdriverio';

import {amendCapabilities, SAFARI_CAPS} from '../desired';
import {getFreePort} from '../helpers/ports';
import {deleteSession, initSession} from '../helpers/session';
import {doesIncludeCookie, doesNotIncludeCookie, newCookie, oldCookie1} from './helpers';

chai.use(chaiAsPromised);

const createPrivateKeyAsync = promisify(_pem.createPrivateKey);
const createCertificateAsync = promisify(_pem.createCertificate);

let caps: Record<string, any>;
let pemCertificate: string;

describe('Safari SSL', function () {
  let sslServer: https.Server;
  let driver: Browser;
  let localHttpsUrl: string;

  before(async function () {
    // Create a random pem certificate
    const privateKey = await createPrivateKeyAsync();
    // @ts-expect-error no types
    const keys = await createCertificateAsync({
      days: 1,
      selfSigned: true,
      serviceKey: privateKey.key,
      altNames: ['localhost'],
    });
    pemCertificate = keys.certificate;
    const port = await getFreePort();
    localHttpsUrl = `https://localhost:${port}/`;
    // Host an SSL server that uses that certificate
    const serverOpts = {key: keys.serviceKey, cert: pemCertificate};
    sslServer = https
      .createServer(serverOpts, (req, res) => {
        res.end('Arbitrary text');
      })
      .listen(port);

    caps = amendCapabilities(SAFARI_CAPS, {
      'appium:safariInitialUrl': localHttpsUrl,
      'appium:noReset': true,
      'appium:customSSLCert': pemCertificate + os.EOL,
    });
  });
  after(async function () {
    await deleteSession();
    if (sslServer) {
      await sslServer.close();
    }
  });

  it('should open pages with untrusted certs if the cert was provided in desired capabilities', async function () {
    const assertPageSource = async () => {
      await waitForCondition(async () => (await driver.getPageSource()).includes('Arbitrary text'), {
        waitMs: 10000,
        intervalMs: 500,
      });
    };

    try {
      driver = await initSession(caps);
      await assertPageSource();
    } finally {
      await deleteSession();
    }

    await delay(100);

    // Now do another session using the same cert to verify that it still works
    try {
      driver = await initSession(caps);
      await driver.url(localHttpsUrl);
      await assertPageSource();
    } finally {
      await deleteSession();
    }
  });

  describe('cookies', function () {
    const secureCookie = {
      ...newCookie,
      secure: true,
      name: 'securecookie',
      value: 'this is a secure cookie',
    };

    before(async function () {
      driver = await initSession(caps);
    });

    beforeEach(async function () {
      await driver.url(localHttpsUrl);
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
