import _ from 'lodash';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { SAFARI_CAPS } from '../desired';
import { initSession, deleteSession } from '../helpers/session';
import { GUINEA_PIG_PAGE, GUINEA_PIG_IFRAME_PAGE } from './helpers';


chai.should();
chai.use(chaiAsPromised);

describe('safari - cookies', function () {
  this.timeout(4 * 60 * 1000);

  let driver;
  before(async () => {
    let caps = _.defaults({
      safariInitialUrl: GUINEA_PIG_PAGE,
      safariAllowPopups: true,
      nativeWebTap: true,
    }, SAFARI_CAPS);
    driver = await initSession(caps);
  });
  after(deleteSession);

  describe('within iframe webview', function () {
    it('should be able to get cookies for a page with none', async () => {
      await driver.get(GUINEA_PIG_IFRAME_PAGE);
      await driver.deleteAllCookies();
      await driver.get(GUINEA_PIG_IFRAME_PAGE);
      let cookies = await driver.allCookies();
      cookies.should.have.length(0);
    });
  });

  describe('within webview', function () {
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

    let doesIncludeCookie = function (cookies, cookie) {
      cookies.map((c) => c.name).should.include(cookie.name);
      cookies.map((c) => c.value).should.include(cookie.value);
    };
    let doesNotIncludeCookie = function (cookies, cookie) {
      cookies.map((c) => c.name).should.not.include(cookie.name);
      cookies.map((c) => c.value).should.not.include(cookie.value);
    };

    beforeEach(async () => {
      await driver.get(GUINEA_PIG_PAGE);
    });

    it('should be able to get cookies for a page', async () => {
      let cookies = await driver.allCookies();
      cookies.length.should.equal(2);
      doesIncludeCookie(cookies, oldCookie1);
      doesIncludeCookie(cookies, oldCookie2);
    });

    it('should be able to set a cookie for a page', async () => {
      await driver.deleteCookie(newCookie.name);
      let cookies = await driver.allCookies();
      doesNotIncludeCookie(cookies, newCookie);

      await driver.setCookie(newCookie);
      cookies = await driver.allCookies();
      doesIncludeCookie(cookies, newCookie);

      // should not clobber old cookies
      doesIncludeCookie(cookies, oldCookie1);
      doesIncludeCookie(cookies, oldCookie2);
    });

    it('should be able to set a cookie with expiry', async () => {
      let expiredCookie = _.defaults({
        expiry: parseInt(Date.now() / 1000, 10) - 1000 // set cookie in past
      }, newCookie);

      await driver.deleteCookie(expiredCookie.name);
      let cookies = await driver.allCookies();
      doesNotIncludeCookie(cookies, expiredCookie);

      await driver.setCookie(expiredCookie);
      cookies = await driver.allCookies();
      // should not include cookie we just added because of expiry
      doesNotIncludeCookie(cookies, expiredCookie);

      // should not clobber old cookies
      doesIncludeCookie(cookies, oldCookie1);
      doesIncludeCookie(cookies, oldCookie2);
    });

    it('should be able to delete one cookie', async () => {
      await driver.deleteCookie(newCookie.name);
      let cookies = await driver.allCookies();
      doesNotIncludeCookie(cookies, newCookie);

      await driver.setCookie(newCookie);
      cookies = await driver.allCookies();
      doesIncludeCookie(cookies, newCookie);

      await driver.deleteCookie(newCookie.name);
      cookies = await driver.allCookies();
      doesNotIncludeCookie(cookies, newCookie);

      doesIncludeCookie(cookies, oldCookie1);
      doesIncludeCookie(cookies, oldCookie2);
    });

    it('should be able to delete all cookies', async () => {
      await driver.deleteCookie(newCookie.name);
      let cookies = await driver.allCookies();
      doesNotIncludeCookie(cookies, newCookie);

      await driver.setCookie(newCookie);
      cookies = await driver.allCookies();
      doesIncludeCookie(cookies, newCookie);

      await driver.deleteAllCookies();
      cookies = await driver.allCookies();
      cookies.length.should.equal(0);

      doesNotIncludeCookie(cookies, oldCookie1);
      doesNotIncludeCookie(cookies, oldCookie2);
    });
  });
});
