import B from 'bluebird';
import {MOCHA_TIMEOUT, initSession, deleteSession} from '../helpers/session';
import {SAFARI_CAPS, amendCapabilities, isIosVersionBelow} from '../desired';
import {
  spinTitle,
  spinTitleEquals,
  spinWait,
  openPage,
  GUINEA_PIG_PAGE,
  spinBodyIncludes,
  // GUINEA_PIG_SCROLLABLE_PAGE,
  GUINEA_PIG_IFRAME_PAGE,
  doesIncludeCookie,
  doesNotIncludeCookie,
  newCookie,
  oldCookie1,
  oldCookie2,
} from './helpers';
import {util} from 'appium/support';
import {retryInterval} from 'asyncbox';


const DEFAULT_CAPS = amendCapabilities(SAFARI_CAPS, {
  'appium:safariInitialUrl': GUINEA_PIG_PAGE,
  // 'appium:safariLogAllCommunication': true,
  // adding 'safariIgnoreWebHostnames' to validate that adding blacklist URL's doesn't break anything
  'appium:safariIgnoreWebHostnames': 'www.yahoo.com,www.bing.com,www.google.com,about:blank',
});

describe('Safari - basics -', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  let chai;
  let expect;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    expect = chai.expect;
  });

  describe('init', function () {
    afterEach(async function () {
      await deleteSession();
    });

    it('should start a session with default init', async function () {
      if (process.env.CI && isIosVersionBelow('18.0')) {
        this.skip();
      }

      driver = await initSession(
        amendCapabilities(SAFARI_CAPS, {
          'appium:noReset': false,
        }),
      );
      await spinBodyIncludes(driver, 'I-AM-ALIVE');
    });

    it('should start a session with custom init', async function () {
      driver = await initSession(DEFAULT_CAPS);
      const title = await spinTitle(driver);
      const expectedTitle = 'I am a page title';
      title.should.equal(expectedTitle);
    });
  });

  describe('basics', function () {
    before(async function () {
      const caps = amendCapabilities(DEFAULT_CAPS, {
        'appium:safariIgnoreFraudWarning': false,
        'appium:showSafariConsoleLog': true,
      });
      driver = await initSession(caps);
    });
    after(async function () {
      await deleteSession();
    });

    // TODO: in appium-remote-debugger, figure out how to check if a page is loaded
    describe.skip('page load timeouts', function () {
      describe('small timeout, slow page load', function () {
        it('should go to the requested page', async function () {
          await driver.setTimeout({pageLoad: 3000});
          await openPage(driver, `${GUINEA_PIG_PAGE}?delay=30000`);

          // the page should not have time to load
          await driver.getPageSource().should.eventually.include(`Let's browse!`);
        });
      });
      describe('no timeout, very slow page', function () {
        const startMs = Date.now();

        it('should go to the requested page', async function () {
          // await driver.setCommandTimeout(12000);
          await driver.setTimeout({pageLoad: 0});
          await openPage(driver, `${GUINEA_PIG_PAGE}?delay=3000`);

          // the page should load after 70000
          await driver.getPageSource().should.eventually.include('I am some page content');
          (Date.now() - startMs).should.be.above(3000);
        });
      });
    });

    describe('context', function () {
      it('should be able to get current context initially', async function () {
        await B.delay(500);
        await driver.getContext().should.eventually.be.ok;
      });
      it('should get full context list through mobile: getContexts', async function () {
        const ctxs = await driver.executeScript('mobile: getContexts', []);
        const webviews = ctxs.filter((ctx) => ctx.id !== 'NATIVE_APP');
        webviews.every((ctx) => util.hasValue(ctx.title) && util.hasValue(ctx.url)).should.be.true;
      });
    });

    describe('implicit wait', function () {
      after(async function () {
        await driver.setTimeout({implicit: 0});
      });
      it('should set the implicit wait for finding web elements', async function () {
        await driver.setTimeout({implicit: 5000});

        const before = new Date().getTime();
        (await driver.$('<dsfsdfsdfdsfsd />')).error.error.should.eql('no such element');
        const after = new Date().getTime();
        (after - before >= 5 * 1000).should.be.ok;
      });
    });

    describe('window title', function () {
      it('should return a valid title on web view', async function () {
        await driver.getTitle().should.eventually.include('I am a page title');
      });
    });

    describe('element handling', function () {
      beforeEach(async function () {
        await openPage(driver, GUINEA_PIG_PAGE);
      });

      it('should find a web element in the web view', async function () {
        (await driver.$('#i_am_an_id')).should.exist;
      });
      it('should find multiple web elements in the web view', async function () {
        (await driver.$$('<a />')).should.have.length.at.least(5);
      });
      it('should fail gracefully to find multiple missing web elements in the web view', async function () {
        (await driver.$$('<blar />')).should.have.length(0);
      });
      it('should find element from another element', async function () {
        const el = await driver.$('.border');
        (await el.$('./form')).should.exist;
      });
      it('should be able to click links', async function () {
        const el = await driver.$('=i am a link');
        await el.click();
        await spinTitleEquals(driver, 'I am another page title');
      });
      it('should retrieve an element attribute', async function () {
        const el = await driver.$('#i_am_an_id');
        await el.getAttribute('id').should.eventually.equal('i_am_an_id');
        expect(await el.getAttribute('blar')).to.be.null;
      });
      it('should retrieve implicit attributes', async function () {
        const els = await driver.$$('<option />');
        els.should.have.length(3);

        await els[2].getAttribute('index').should.eventually.equal('2');
      });
      it('should retrieve an element text', async function () {
        const el = await driver.$('#i_am_an_id');
        await el.getText().should.eventually.equal('I am a div');
      });
      // TODO: figure out what equality means here
      it.skip('should check if two elements are equal', async function () {
        const el1 = await driver.$('#i_am_an_id');
        const el2 = await driver.$('#i_am_an_id');
        el1.should.equal(el2);
      });
      it('should return the page source', async function () {
        const source = await driver.getPageSource();
        source.should.include('<html');
        source.should.include('I am a page title');
        source.should.include('i appear 3 times');
        source.should.include('</html>');
      });
      it('should get current url', async function () {
        await driver.getUrl().should.eventually.include('test/guinea-pig');
      });
      it('should get updated URL without breaking window handles', async function () {
        const el = await driver.$('=i am an anchor link');
        await el.click();

        // allow the click to happen
        await B.delay(500);

        await driver.getUrl().should.eventually.contain('#anchor');
        await driver.getWindowHandles().should.eventually.be.ok;
      });
      it('should send keystrokes to specific element', async function () {
        const el = await driver.$('#comments');
        await el.clearValue();
        await el.setValue('hello world');
        ['how world', 'hello world'].should.include((await el.getAttribute('value')).toLowerCase());
      });
      it('should send keystrokes to active element', async function () {
        const el = await driver.$('#comments');
        await el.click();
        await el.setValue('hello world');
        ['how world', 'hello world'].should.include((await el.getAttribute('value')).toLowerCase());
      });
      it('should clear element', async function () {
        const el = await driver.$('#comments');
        await el.setValue('hello world');
        await el.getAttribute('value').should.eventually.have.length.above(0);
        await el.clearValue();
        await el.getAttribute('value').should.eventually.equal('');
      });
      it('should say whether an input is selected', async function () {
        const el = await driver.$('#unchecked_checkbox');
        await el.isSelected().should.eventually.not.be.ok;
        await el.click();

        await retryInterval(10, 1000, async function () {
          await el.isSelected().should.eventually.be.ok;
        });
      });
      it('should be able to retrieve css properties', async function () {
        const el = await driver.$('#fbemail');
        (await el.getCSSProperty('background-color')).value.should.equal('rgba(255,255,255,1)');
      });
      it('should retrieve an element size', async function () {
        const el = await driver.$('#i_am_an_id');
        const size = await el.getSize();
        size.width.should.be.above(0);
        size.height.should.be.above(0);
      });
      it('should get location of an element', async function () {
        const el = await driver.$('#fbemail');
        const loc = await el.getLocation();
        loc.x.should.be.above(0);
        loc.y.should.be.above(0);
      });
      // getTagName not supported by mjwp
      it.skip('should retrieve tag name of an element', async function () {
        const el = await driver.$('#fbemail');
        const a = await driver.$('<a />');
        await el.getTagName().should.eventually.equal('input');
        await a.getTagName().should.eventually.equal('a');
      });
      it('should retrieve a window size', async function () {
        const size = await driver.getWindowRect();
        size.height.should.be.above(0);
        size.width.should.be.above(0);
      });
      // TODO: Update for WdIO compatibility
      it.skip('should submit a form', async function () {
        const el = await driver.$('#comments');
        const form = await driver.$('#jumpContact');
        await el.setValue('This is a comment');
        await form.submit();
        await spinWait(async function () {
          const comments = await driver.$('#your_comments');
          await comments.getText().should.eventually.equal('Your comments: This is a comment');
        });
      });
      it('should return true when the element is displayed', async function () {
        const el = await driver.$('=i am a link');
        await el.isDisplayed().should.eventually.be.ok;
      });
      it('should return false when the element is not displayed', async function () {
        const el = await driver.$('#invisible div');
        await el.isDisplayed().should.eventually.not.be.ok;
      });
      it('should return true when the element is enabled', async function () {
        const el = await driver.$('=i am a link');
        await el.isEnabled().should.eventually.be.ok;
      });
      it('should return false when the element is not enabled', async function () {
        await driver.executeScript(`$('#fbemail').attr('disabled', 'disabled');`, []);
        const el = await driver.$('#fbemail');
        await el.isEnabled().should.eventually.not.be.ok;
      });
      it('should return the active element', async function () {
        const testText = 'hi there';
        const el = await driver.$('#i_am_a_textbox');
        await el.setValue(testText);
        const activeElId = await driver.getActiveElement();
        const activeEl = await driver.$(activeElId);
        await activeEl.getAttribute('value').should.eventually.equal(testText);
      });
      it('should properly navigate to anchor', async function () {
        const el = await driver.$('=i am an anchor link');
        await el.click();

        // let the click happen
        await B.delay(500);

        const url = await driver.getUrl();
        await openPage(driver, url);

        await driver.getUrl().should.eventually.include('#anchor');
      });
      it('should be able to refresh', async function () {
        await driver.refresh();
      });
    });
    // TODO: Update for WdIO compatibility
    // describe('console logging', function () {
    //   beforeEach(async function () {
    //     // get the logs to clear anything out
    //     await driver.log('safariConsole');
    //     await driver.get(GUINEA_PIG_SCROLLABLE_PAGE);
    //   });

    //   // there can be other things logged, so check that the text is there somewhere
    //   function checkTexts (logs, expectedTexts) {
    //     const logText = _.map(logs, (el) => el.message || el.text).join(',');
    //     for (const line of expectedTexts) {
    //       logText.should.include(line);
    //     }
    //   }

    //   it('should get console logs for JS on the page', async function () {
    //     // reload the page to execute JS
    //     await openPage(driver, GUINEA_PIG_PAGE);

    //     const logs = await driver.log('safariConsole');
    //     checkTexts(logs, ['Hello from Appium', 'Loading guinea-pig page', 'Done']);
    //   });
    //   it('should get console logs for JS on the page with error', async function () {
    //     // reload the page to execute JS
    //     await openPage(driver, `${GUINEA_PIG_PAGE}?throwError=xcuitest-error`);

    //     const logs = await driver.log('safariConsole');
    //     checkTexts(logs, ['Hello from Appium', 'Loading guinea-pig page', 'Done', 'JavaScript Error: xcuitest-error']);
    //   });
    //   it('should get console logs for inserted JS', async function () {
    //     const strings = [
    //       'Log something to debug',
    //       'Log something to warn',
    //       'Log something to error',
    //     ];

    //     for (const line of strings) {
    //       await driver.execute(`console.log('${line}');`);
    //     }

    //     const logs = await driver.log('safariConsole');
    //     checkTexts(logs, strings);

    //     // execute some more and see that we don't have overlap
    //     await driver.execute(`console.log('HELLO WORLD')`);

    //     // new logs should _just_ be the above statement
    //     const logs2 = await driver.log('safariConsole');
    //     logs2.should.have.length(1);

    //     // there should be no overlap
    //     _.intersection(logs, logs2).should.have.length(0);
    //   });
    // });

    describe('cookies', function () {
      describe('within iframe webview', function () {
        it('should be able to get cookies for a page with none', async function () {
          await openPage(driver, GUINEA_PIG_IFRAME_PAGE);
          await driver.deleteAllCookies();

          await retryInterval(5, 1000, async function () {
            await driver.getAllCookies().should.eventually.have.length(0);
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
            const cookies = await driver.getAllCookies();
            cookies.length.should.equal(2);
            doesIncludeCookie(cookies, oldCookie1);
            doesIncludeCookie(cookies, oldCookie2);
          });

          it('should be able to set a cookie for a page', async function () {
            await driver.addCookie(newCookie);
            const cookies = await driver.getAllCookies();
            doesIncludeCookie(cookies, newCookie);

            // should not clobber old cookies
            doesIncludeCookie(cookies, oldCookie1);
            doesIncludeCookie(cookies, oldCookie2);
          });

          it('should be able to set a cookie with expiry', async function () {
            const expiredCookie = {
              ...newCookie,
              expiry: parseInt(String(Date.now() / 1000), 10) - 1000, // set cookie in past
              name: 'expiredcookie',
            };

            let cookies = await driver.getAllCookies();
            doesNotIncludeCookie(cookies, expiredCookie);

            await driver.addCookie(expiredCookie);
            cookies = await driver.getAllCookies();
            // should not include cookie we just added because of expiry
            doesNotIncludeCookie(cookies, expiredCookie);

            // should not clobber old cookies
            doesIncludeCookie(cookies, oldCookie1);
            doesIncludeCookie(cookies, oldCookie2);

            await driver.deleteCookie(expiredCookie.name);
          });

          it('should be able to delete one cookie', async function () {
            await driver.addCookie(newCookie);
            let cookies = await driver.getAllCookies();
            doesIncludeCookie(cookies, newCookie);

            await driver.deleteCookie(newCookie.name);
            cookies = await driver.getAllCookies();
            doesNotIncludeCookie(cookies, newCookie);

            doesIncludeCookie(cookies, oldCookie1);
            doesIncludeCookie(cookies, oldCookie2);
          });

          it('should be able to delete all cookies', async function () {
            await driver.addCookie(newCookie);
            let cookies = await driver.getAllCookies();
            doesIncludeCookie(cookies, newCookie);

            await driver.deleteAllCookies();
            cookies = await driver.getAllCookies();
            cookies.length.should.equal(0);

            doesNotIncludeCookie(cookies, oldCookie1);
            doesNotIncludeCookie(cookies, oldCookie2);
          });

          describe('native context', function () {
            const notImplementedRegExp = /Method is not implemented/;
            let context;
            beforeEach(async function () {
              context = await driver.getContext();
              await driver.switchContext('NATIVE_APP');
            });
            afterEach(async function () {
              if (context) {
                await driver.switchContext(context);
              }
            });
            it('should reject all functions', async function () {
              await driver.addCookie(newCookie).should.be.rejectedWith(notImplementedRegExp);
              await driver.getAllCookies().should.be.rejectedWith(notImplementedRegExp);
              await driver
                .deleteCookie(newCookie.name)
                .should.be.rejectedWith(notImplementedRegExp);
              await driver.deleteAllCookies().should.be.rejectedWith(notImplementedRegExp);
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

});
