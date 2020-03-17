import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import B from 'bluebird';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { SAFARI_CAPS } from '../desired';
import { spinTitle, spinTitleEquals, spinWait, openPage, GUINEA_PIG_PAGE,
         GUINEA_PIG_SCROLLABLE_PAGE, PHISHING_END_POINT, GUINEA_PIG_IFRAME_PAGE } from './helpers';
import { util } from 'appium-support';
import { retryInterval } from 'asyncbox';


chai.should();
chai.use(chaiAsPromised);
const expect = chai.expect;

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

const DEFAULT_CAPS = _.defaults({
  safariInitialUrl: GUINEA_PIG_PAGE,
}, SAFARI_CAPS);

describe('Safari - basics -', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  describe('init', function () {
    afterEach(async function () {
      await deleteSession();
    });

    it('should start a session with default init', async function () {
      const expectedTitle = process.env.REAL_DEVICE
        ? 'Appium: Mobile App Automation Made Awesome.'
        : 'Appium/welcome';
      driver = await initSession(SAFARI_CAPS);
      const title = await spinTitle(driver);
      title.should.equal(expectedTitle);
    });

    it('should start a session with custom init', async function () {
      driver = await initSession(DEFAULT_CAPS);
      let title = await spinTitle(driver);
      const expectedTitle = 'I am a page title';
      title.should.equal(expectedTitle);
    });
  });

  describe('basics', function () {
    before(async function () {
      const caps = _.defaults({
        safariIgnoreFraudWarning: false,
        showSafariConsoleLog: true,
      }, DEFAULT_CAPS);
      driver = await initSession(caps);
    });
    after(async function () {
      await deleteSession();
    });


    // TODO: in appium-remote-debugger, figure out how to check if a page is loaded
    describe.skip('page load timeouts', function () {
      describe('small timeout, slow page load', function () {
        it('should go to the requested page', async function () {
          await driver.setPageLoadTimeout(3000);
          await openPage(driver, `${GUINEA_PIG_PAGE}?delay=30000`);

          // the page should not have time to load
          await driver.source().should.eventually.include(`Let's browse!`);
        });
      });
      describe('no timeout, very slow page', function () {
        const startMs = Date.now();

        it('should go to the requested page', async function () {
          await driver.setCommandTimeout(12000);
          await driver.setPageLoadTimeout(0);
          await openPage(driver, `${GUINEA_PIG_PAGE}?delay=3000`);

          // the page should load after 70000
          await driver.source().should.eventually.include('I am some page content');
          (Date.now() - startMs).should.be.above(3000);
        });
      });
    });

    describe('context', function () {
      it('should be able to get current context initially', async function () {
        await B.delay(500);
        await driver.currentContext().should.eventually.be.ok;
      });
      it('should get full context list through mobile: getContexts', async function () {
        const ctxs = await driver.execute('mobile: getContexts');
        const webviews = ctxs.filter((ctx) => ctx.id !== 'NATIVE_APP');
        webviews.every((ctx) => util.hasValue(ctx.title) && util.hasValue(ctx.url)).should.be.true;
      });
    });

    describe('implicit wait', function () {
      after(async function () {
        await driver.setImplicitWaitTimeout(0);
      });
      it('should set the implicit wait for finding web elements', async function () {
        await driver.setImplicitWaitTimeout(5000);

        const before = new Date().getTime() / 1000;
        let hasThrown = false;

        /**
         * we have to use try catch to actually halt the process here
         */
        try {
          await driver.elementByTagName('notgonnabethere');
        } catch (e) {
          hasThrown = true;
        } finally {
          hasThrown.should.be.ok;
        }

        const after = new Date().getTime() / 1000;
        ((after - before) > 5).should.be.ok;
      });
    });

    describe('window title', function () {
      it('should return a valid title on web view', async function () {
        await driver.title().should.eventually.include('I am a page title');
      });
    });

    describe('element handling', function () {
      beforeEach(async function () {
        await openPage(driver, GUINEA_PIG_PAGE);
      });

      it('should find a web element in the web view', async function () {
        await driver.elementById('i_am_an_id').should.eventually.exist;
      });
      it('should find multiple web elements in the web view', async function () {
        await driver.elementsByTagName('a').should.eventually.have.length.at.least(5);
      });
      it('should fail gracefully to find multiple missing web elements in the web view', async function () {
        await driver.elementsByTagName('blar').should.eventually.have.length(0);
      });
      it('should find element from another element', async function () {
        const el = await driver.elementByClassName('border');
        await el.elementByXPath('./form').should.eventually.exist;
      });
      it('should be able to click links', async function () {
        await driver.elementByLinkText('i am a link').click();
        await spinTitleEquals(driver, 'I am another page title');
      });
      it('should retrieve an element attribute', async function () {
        const el = await driver.elementById('i_am_an_id');
        await el.getAttribute('id').should.eventually.equal('i_am_an_id');
        expect(await el.getAttribute('blar')).to.be.null;
      });
      it('should retrieve implicit attributes', async function () {
        const els = await driver.elementsByTagName('option');
        els.should.have.length(3);

        await els[2].getAttribute('index').should.eventually.equal('2');
      });
      it('should retrieve an element text', async function () {
        await driver.elementById('i_am_an_id').text()
          .should.eventually.equal('I am a div');
      });
      // TODO: figure out what equality means here
      it.skip('should check if two elements are equal', async function () {
        const el1 = await driver.elementById('i_am_an_id');
        const el2 = await driver.elementByCss('#i_am_an_id');
        el1.should.equal(el2);
      });
      it('should return the page source', async function () {
        const source = await driver.source();
        source.should.include('<html');
        source.should.include('I am a page title');
        source.should.include('i appear 3 times');
        source.should.include('</html>');
      });
      it('should get current url', async function () {
        await driver.url().should.eventually.include('test/guinea-pig');
      });
      it('should get updated URL without breaking window handles', async function () {
        await driver.elementByLinkText('i am an anchor link').click();

        // allow the click to happen
        await B.delay(500);

        await driver.url().should.eventually.contain('#anchor');
        await driver.windowHandles().should.eventually.be.ok;
      });
      it('should send keystrokes to specific element', async function () {
        const el = await driver.elementById('comments');
        await el.clear();
        await el.sendKeys('hello world');
        ['how world', 'hello world'].should.include((await el.getAttribute('value')).toLowerCase());
      });
    });
    describe('element handling', function () {
      beforeEach(async function () {
        await openPage(driver, GUINEA_PIG_PAGE);
      });

      it('should send keystrokes to active element', async function () {
        const el = await driver.elementById('comments');
        await el.click();
        await el.type('hello world');
        ['how world', 'hello world'].should.include((await el.getAttribute('value')).toLowerCase());
      });
      it('should clear element', async function () {
        const el = await driver.elementById('comments');
        await el.sendKeys('hello world');
        await el.getAttribute('value').should.eventually.have.length.above(0);
        await el.clear();
        await el.getAttribute('value').should.eventually.equal('');
      });
      it('should say whether an input is selected', async function () {
        const el = await driver.elementById('unchecked_checkbox');
        await el.isSelected().should.eventually.not.be.ok;
        await el.click();

        await retryInterval(10, 1000, async function () {
          await el.isSelected().should.eventually.be.ok;
        });
      });
      it('should be able to retrieve css properties', async function () {
        await driver.elementById('fbemail').getComputedCss('background-color')
          .should.eventually.equal('rgba(255, 255, 255, 1)');
      });
      it('should retrieve an element size', async function () {
        const size = await driver.elementById('i_am_an_id').getSize();
        size.width.should.be.above(0);
        size.height.should.be.above(0);
      });
      it('should get location of an element', async function () {
        const loc = await driver.elementById('fbemail').getLocation();
        loc.x.should.be.above(0);
        loc.y.should.be.above(0);
      });
      // getTagName not supported by mjwp
      it.skip('should retrieve tag name of an element', async function () {
        const el = await driver.elementById('fbemail');
        const a = await driver.elementByCss('a');
        await el.getTagName().should.eventually.equal('input');
        await a.getTagName().should.eventually.equal('a');
      });
      it('should retrieve a window size', async function () {
        const size = await driver.getWindowSize();
        size.height.should.be.above(0);
        size.width.should.be.above(0);
      });
      it('should move to an arbitrary x-y element and click on it', async function () {
        const el = await driver.elementByLinkText('i am a link');
        await driver.moveTo(el, 5, 15);
        await el.click();
        await spinTitleEquals(driver, 'I am another page title');
      });
      it('should submit a form', async function () {
        const el = await driver.elementById('comments');
        const form = await driver.elementById('jumpContact');
        await el.sendKeys('This is a comment');
        await form.submit();
        await spinWait(async function () {
          await driver.elementById('your_comments').text()
            .should.eventually.equal('Your comments: This is a comment');
        });
      });
      it('should return true when the element is displayed', async function () {
        await driver.elementByLinkText('i am a link').isDisplayed()
          .should.eventually.be.ok;
      });
      it('should return false when the element is not displayed', async function () {
        await driver.elementById('invisible div').isDisplayed()
          .should.eventually.not.be.ok;
      });
      it('should return true when the element is enabled', async function () {
        await driver.elementByLinkText('i am a link').isEnabled()
          .should.eventually.be.ok;
      });
      it('should return false when the element is not enabled', async function () {
        await driver.execute(`$('#fbemail').attr('disabled', 'disabled');`);
        await driver.elementById('fbemail').isEnabled()
          .should.eventually.not.be.ok;
      });
      it('should return the active element', async function () {
        const testText = 'hi there';
        await driver.elementById('i_am_a_textbox').sendKeys(testText);
        await driver.active().getAttribute('value')
          .should.eventually.equal(testText);
      });
      it('should properly navigate to anchor', async function () {
        await driver.elementByLinkText('i am an anchor link').click();

        // let the click happen
        await B.delay(500);

        const url = await driver.url();
        await openPage(driver, url);

        await driver.url().should.eventually.include('#anchor');
      });
      it('should be able to refresh', async function () {
        await driver.refresh();
      });
    });
    describe('console logging', function () {
      beforeEach(async function () {
        // get the logs to clear anything out
        await driver.log('safariConsole');
        await driver.get(GUINEA_PIG_SCROLLABLE_PAGE);
      });

      // there can be other things logged, so check that the text is there somewhere
      function checkTexts (logs, expectedTexts) {
        const logText = _.map(logs, (el) => el.message || el.text).join(',');
        for (const line of expectedTexts) {
          logText.should.include(line);
        }
      }

      it('should get console logs for JS on the page', async function () {
        // reload the page to execute JS
        await openPage(driver, GUINEA_PIG_PAGE);

        const logs = await driver.log('safariConsole');
        checkTexts(logs, ['Hello from Appium', 'Loading guinea-pig page', 'Done']);
      });
      it('should get console logs for JS on the page with error', async function () {
        // reload the page to execute JS
        await openPage(driver, `${GUINEA_PIG_PAGE}?throwError=xcuitest-error`);

        const logs = await driver.log('safariConsole');
        checkTexts(logs, ['Hello from Appium', 'Loading guinea-pig page', 'Done', 'JavaScript Error: xcuitest-error']);
      });
      it('should get console logs for inserted JS', async function () {
        const strings = [
          'Log something to debug',
          'Log something to warn',
          'Log something to error',
        ];

        for (const line of strings) {
          await driver.execute(`console.log('${line}');`);
        }

        const logs = await driver.log('safariConsole');
        checkTexts(logs, strings);

        // execute some more and see that we don't have overlap
        await driver.execute(`console.log('HELLO WORLD')`);

        // new logs should _just_ be the above statement
        const logs2 = await driver.log('safariConsole');
        logs2.should.have.length(1);

        // there should be no overlap
        _.intersection(logs, logs2).should.have.length(0);
      });
    });

    describe('cookies', function () {
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
            const cookies = await driver.allCookies();
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

          describe('native context', function () {
            const notImplementedRegExp = /Method is not implemented/;
            let context;
            beforeEach(async function () {
              context = await driver.currentContext();
              await driver.context('NATIVE_APP');
            });
            afterEach(async function () {
              if (context) {
                await driver.context(context);
              }
            });
            it('should reject all functions', async function () {
              await driver.setCookie(newCookie).should.eventually.be.rejectedWith(notImplementedRegExp);
              await driver.allCookies().should.eventually.be.rejectedWith(notImplementedRegExp);
              await driver.deleteCookie(newCookie.name).should.eventually.be.rejectedWith(notImplementedRegExp);
              await driver.deleteAllCookies().should.eventually.be.rejectedWith(notImplementedRegExp);
            });
          });
        });

        describe('secure', function () {
          /*
           * secure cookie tests are in `./safari-ssl-e2e-specs.js`
           */
        });
      });
    });
  });

  describe('safariIgnoreFraudWarning', function () {
    describe('false', function () {
      beforeEach(async function () {
        driver = await initSession(_.defaults({
          safariIgnoreFraudWarning: false,
        }, DEFAULT_CAPS));
      });
      afterEach(async function () {
        await deleteSession();
      });

      it('should display a phishing warning', async function () {
        await openPage(driver, PHISHING_END_POINT);

        // on iOS 12.2+ the browser never fully loads the page with a phishing
        // warning, and it never gets into the Web Inspector.
        // it does, however, get visible in the native context!
        const ctx = await driver.currentContext();
        try {
          await driver.context('NATIVE_APP');

          await B.delay(1000);
          await retryInterval(10, 500, async function () {
            await driver.source().should.eventually.include('Deceptive Website Warning');
          });
        } finally {
          await driver.context(ctx);
        }
      });
    });
    describe('true', function () {
      beforeEach(async function () {
        driver = await initSession(_.defaults({
          safariIgnoreFraudWarning: true,
        }, DEFAULT_CAPS));
      });
      afterEach(async function () {
        await deleteSession();
      });

      it('should not display a phishing warning', async function () {
        await openPage(driver, PHISHING_END_POINT);
        await driver.title().should.eventually.not.eql('Deceptive Website Warning');
      });
    });
  });
});

export { doesIncludeCookie, doesNotIncludeCookie, newCookie, oldCookie1, oldCookie2 };
