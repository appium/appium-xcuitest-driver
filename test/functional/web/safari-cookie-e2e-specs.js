import _ from 'lodash';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { SAFARI_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import { openPage, GUINEA_PIG_PAGE, GUINEA_PIG_IFRAME_PAGE } from './helpers';
import { retryInterval } from 'asyncbox';


chai.should();
chai.use(chaiAsPromised);

function doesIncludeCookie (cookies, cookie) {
  cookies.map((c) => c.name).should.include(cookie.name);
  cookies.map((c) => c.value).should.include(cookie.value);
}
function doesNotIncludeCookie (cookies, cookie) {
  cookies.map((c) => c.name).should.not.include(cookie.name);
  cookies.map((c) => c.value).should.not.include(cookie.value);
}

const newCookie = {
  name: 'newcookie',
  value: 'i am new here'
};
const oldCookie1 = {
  name: 'guineacookie1',
  value: 'i am a cookie value'
};
const oldCookie2 = {
  name: 'guineacookie2',
  value: 'cookié2'
};

describe('safari - cookies', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async function () {
    let caps = _.defaults({
      safariInitialUrl: GUINEA_PIG_PAGE,
      safariAllowPopups: true,
      nativeWebTap: true,
    }, SAFARI_CAPS);
    driver = await initSession(caps);
  });
  after(async function () {
    await deleteSession();
  });

  describe('within iframe webview', function () {
    it('should be able to get cookies for a page with none', async function () {
      await openPage(driver, GUINEA_PIG_IFRAME_PAGE);
      await driver.deleteAllCookies();

      await retryInterval(5, 1000, async function () {
        await driver.allCookies().should.eventually.have.length(0);
      });
    });
  });

  describe('within webview', function () {
    describe('insecure', function () {
      beforeEach(async function () {
        await openPage(driver, GUINEA_PIG_PAGE);
        await driver.deleteCookie(newCookie.name);
      });

      it('should be able to get cookies for a page', async function () {
        let cookies = await driver.allCookies();
        cookies.length.should.equal(2);
        doesIncludeCookie(cookies, oldCookie1);
        doesIncludeCookie(cookies, oldCookie2);
      });

      it('should be able to set a cookie for a page', async function () {
        await driver.setCookie(newCookie);
        const cookies = await driver.allCookies();
        doesIncludeCookie(cookies, newCookie);

        // should not clobber old cookies
        doesIncludeCookie(cookies, oldCookie1);
        doesIncludeCookie(cookies, oldCookie2);
      });

      it('should be able to set a cookie with expiry', async function () {
        const expiredCookie = Object.assign({}, newCookie, {
          expiry: parseInt(Date.now() / 1000, 10) - 1000, // set cookie in past
          name: 'expiredcookie',
        });

        let cookies = await driver.allCookies();
        doesNotIncludeCookie(cookies, expiredCookie);

        await driver.setCookie(expiredCookie);
        cookies = await driver.allCookies();
        // should not include cookie we just added because of expiry
        doesNotIncludeCookie(cookies, expiredCookie);

        // should not clobber old cookies
        doesIncludeCookie(cookies, oldCookie1);
        doesIncludeCookie(cookies, oldCookie2);

        await driver.deleteCookie(expiredCookie.name);
      });

      it('should be able to delete one cookie', async function () {
        await driver.setCookie(newCookie);
        let cookies = await driver.allCookies();
        doesIncludeCookie(cookies, newCookie);

        await driver.deleteCookie(newCookie.name);
        cookies = await driver.allCookies();
        doesNotIncludeCookie(cookies, newCookie);

        doesIncludeCookie(cookies, oldCookie1);
        doesIncludeCookie(cookies, oldCookie2);
      });

      it('should be able to delete all cookies', async function () {
        await driver.setCookie(newCookie);
        let cookies = await driver.allCookies();
        doesIncludeCookie(cookies, newCookie);

        await driver.deleteAllCookies();
        cookies = await driver.allCookies();
        cookies.length.should.equal(0);

        doesNotIncludeCookie(cookies, oldCookie1);
        doesNotIncludeCookie(cookies, oldCookie2);
      });
    });

    describe('secure', function () {
      /*
       * secure cookie tests are in `./safari-ssl-e2e-specs.js`
       */
    });
  });
});

export { doesIncludeCookie, doesNotIncludeCookie, newCookie, oldCookie1, oldCookie2 };
