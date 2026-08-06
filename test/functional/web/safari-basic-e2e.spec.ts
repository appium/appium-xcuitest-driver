import assert from 'node:assert/strict';
import {describe, it, before, after, beforeEach, afterEach} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

import {util} from 'appium/support.js';
import {retryInterval} from 'asyncbox';
import type {Browser} from 'webdriverio';

import {SAFARI_CAPS, amendCapabilities} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';
import {
  createGuineaPigServerSession,
  spinTitleEquals,
  spinWait,
  openPage,
  guineaPigPage,
  guineaPigIframePage,
  doesIncludeCookie,
  doesNotIncludeCookie,
  newCookie,
  oldCookie1,
  oldCookie2,
} from './helpers/index.js';

function getDefaultCaps(baseUrl: string) {
  return amendCapabilities(SAFARI_CAPS, {
    'appium:safariInitialUrl': guineaPigPage(baseUrl),
    // 'appium:safariLogAllCommunication': true,
    // adding 'safariIgnoreWebHostnames' to validate that adding blacklist URL's doesn't break anything
    'appium:safariIgnoreWebHostnames': 'www.yahoo.com,www.bing.com,www.google.com,about:blank',
  });
}

describe('Safari - basics -', function () {
  let driver: Browser;
  let baseUrl: string;
  const guineaPigServer = createGuineaPigServerSession();

  describe('basics', function () {
    before(async function () {
      baseUrl = (await guineaPigServer.setup()).baseUrl;
      const caps = amendCapabilities(getDefaultCaps(baseUrl), {
        'appium:safariIgnoreFraudWarning': false,
        'appium:showSafariConsoleLog': true,
      });
      driver = await initSession(caps);
    });
    after(async function () {
      await deleteSession();
      await guineaPigServer.teardown();
    });

    // TODO: in appium-remote-debugger, figure out how to check if a page is loaded
    describe.skip('page load timeouts', function () {
      describe('small timeout, slow page load', function () {
        it('should go to the requested page', async function () {
          await driver.setTimeout({pageLoad: 3000});
          await openPage(driver, `${guineaPigPage(baseUrl)}?delay=30000`);

          // the page should not have time to load
          assert.ok((await driver.getPageSource()).includes(`Let's browse!`));
        });
      });
      describe('no timeout, very slow page', function () {
        const startMs = Date.now();

        it('should go to the requested page', async function () {
          // await driver.setCommandTimeout(12000);
          await driver.setTimeout({pageLoad: 0});
          await openPage(driver, `${guineaPigPage(baseUrl)}?delay=3000`);

          // the page should load after 70000
          assert.ok((await driver.getPageSource()).includes('I am some page content'));
          assert.ok(Date.now() - startMs > 3000);
        });
      });
    });

    describe('context', function () {
      it('should be able to get current context initially', async function () {
        await delay(500);
        assert.ok(await driver.getContext());
      });
      it('should get full context list through mobile: getContexts', async function () {
        const ctxs = (await driver.executeScript('mobile: getContexts', [])) as unknown as {
          id: string;
          title: string;
          url: string;
        }[];
        const webviews = ctxs.filter((ctx) => ctx.id !== 'NATIVE_APP');
        assert.strictEqual(
          webviews.every((ctx) => util.hasValue(ctx.title) && util.hasValue(ctx.url)),
          true,
        );
      });
    });

    describe('implicit wait', function () {
      after(async function () {
        await driver.setTimeout({implicit: 0});
      });
      it('should set the implicit wait for finding web elements', async function () {
        await driver.setTimeout({implicit: 5000});

        const before = new Date().getTime();
        assert.strictEqual(((await driver.$('<dsfsdfsdfdsfsd />')) as any).error.error, 'no such element');
        const after = new Date().getTime();
        assert.ok(after - before >= 5 * 1000);
      });
    });

    describe('window title', function () {
      it('should return a valid title on web view', async function () {
        assert.ok((await driver.getTitle()).includes('I am a page title'));
      });
    });

    describe('element handling', function () {
      beforeEach(async function () {
        await openPage(driver, guineaPigPage(baseUrl));
      });

      it('should find a web element in the web view', async function () {
        assert.ok(await driver.$('#i_am_an_id'));
      });
      it('should find multiple web elements in the web view', async function () {
        assert.ok(((await driver.$$('<a />')).length as unknown as number) >= 5);
      });
      it('should fail gracefully to find multiple missing web elements in the web view', async function () {
        assert.strictEqual((await driver.$$('<blar />')).length, 0);
      });
      it('should find element from another element', async function () {
        const el = await driver.$('.border');
        assert.ok(await el.$('./form'));
      });
      it('should be able to click links', async function () {
        const el = await driver.$('=i am a link');
        await el.click();
        await spinTitleEquals(driver, 'I am another page title');
      });
      it('should retrieve an element attribute', async function () {
        const el = await driver.$('#i_am_an_id');
        assert.strictEqual(await el.getAttribute('id'), 'i_am_an_id');
        assert.strictEqual(await el.getAttribute('blar'), null);
      });
      it('should retrieve implicit attributes', async function () {
        const els = await driver.$$('<option />');
        assert.strictEqual(els.length, 3);

        assert.strictEqual(await els[2].getAttribute('index'), '2');
      });
      it('should retrieve an element text', async function () {
        const el = await driver.$('#i_am_an_id');
        assert.strictEqual(await el.getText(), 'I am a div');
      });
      // TODO: figure out what equality means here
      it.skip('should check if two elements are equal', async function () {
        const el1 = await driver.$('#i_am_an_id');
        const el2 = await driver.$('#i_am_an_id');
        assert.strictEqual(el1, el2);
      });
      it('should return the page source', async function () {
        const source = await driver.getPageSource();
        assert.ok(source.includes('<html'));
        assert.ok(source.includes('I am a page title'));
        assert.ok(source.includes('i appear 3 times'));
        assert.ok(source.includes('</html>'));
      });
      it('should get current url', async function () {
        assert.ok((await driver.getUrl()).includes('test/guinea-pig'));
      });
      it('should get updated URL without breaking window handles', async function () {
        const el = await driver.$('=i am an anchor link');
        await el.click();

        // allow the click to happen
        await delay(500);

        assert.ok((await driver.getUrl()).includes('#anchor'));
        assert.ok(await driver.getWindowHandles());
      });
      it('should send keystrokes to specific element', async function () {
        const el = await driver.$('#comments');
        await el.clearValue();
        await el.setValue('hello world');
        assert.ok(['how world', 'hello world'].includes(((await el.getAttribute('value')) as string).toLowerCase()));
      });
      it('should send keystrokes to active element', async function () {
        const el = await driver.$('#comments');
        await el.click();
        await el.setValue('hello world');
        assert.ok(
          ['how world', 'hello world'].includes(
            ((await el.getAttribute('value')) as string | null)?.toLowerCase() as string,
          ),
        );
      });
      it('should clear element', async function () {
        const el = await driver.$('#comments');
        await el.setValue('hello world');
        assert.ok(((await el.getAttribute('value')) as string).length > 0);
        await el.clearValue();
        assert.strictEqual(await el.getAttribute('value'), '');
      });
      it('should say whether an input is selected', async function () {
        const el = await driver.$('#unchecked_checkbox');
        assert.ok(!(await el.isSelected()));
        await el.click();

        await retryInterval(10, 1000, async function () {
          assert.ok(await el.isSelected());
        });
      });
      it('should be able to retrieve css properties', async function () {
        const el = await driver.$('#fbemail');
        assert.ok(((await el.getCSSProperty('background-color')).value as string).includes('rgb'));
      });
      it('should retrieve an element size', async function () {
        const el = await driver.$('#i_am_an_id');
        const size = await el.getSize();
        assert.ok(size.width > 0);
        assert.ok(size.height > 0);
      });
      it('should get location of an element', async function () {
        const el = await driver.$('#fbemail');
        const loc = await el.getLocation();
        assert.ok(loc.x > 0);
        assert.ok(loc.y > 0);
      });
      // getTagName not supported by mjwp
      it.skip('should retrieve tag name of an element', async function () {
        const el = await driver.$('#fbemail');
        const a = await driver.$('<a />');
        assert.strictEqual(await el.getTagName(), 'input');
        assert.strictEqual(await a.getTagName(), 'a');
      });
      it('should retrieve a window size', async function () {
        const size = await driver.getWindowRect();
        assert.ok(size.height > 0);
        assert.ok(size.width > 0);
      });
      // TODO: Update for WdIO compatibility
      it.skip('should submit a form', async function () {
        const el = await driver.$('#comments');
        const form = await driver.$('#jumpContact');
        await el.setValue('This is a comment');
        await form.submit(el as any);
        await spinWait(async function () {
          const comments = await driver.$('#your_comments');
          assert.strictEqual(await comments.getText(), 'Your comments: This is a comment');
        });
      });
      it('should return true when the element is displayed', async function () {
        const el = await driver.$('=i am a link');
        assert.ok(await el.isDisplayed());
      });
      it('should return false when the element is not displayed', async function () {
        const el = await driver.$('#invisible div');
        assert.ok(!(await el.isDisplayed()));
      });
      it('should return true when the element is enabled', async function () {
        const el = await driver.$('=i am a link');
        assert.ok(await el.isEnabled());
      });
      it('should return false when the element is not enabled', async function () {
        await driver.executeScript(`$('#fbemail').attr('disabled', 'disabled');`, []);
        const el = await driver.$('#fbemail');
        assert.ok(!(await el.isEnabled()));
      });
      it('should return the active element', async function () {
        const testText = 'hi there';
        const el = await driver.$('#i_am_a_textbox');
        await el.setValue(testText);
        const activeElId = await driver.getActiveElement();
        const activeEl = await driver.$(activeElId);
        assert.strictEqual(await activeEl.getAttribute('value'), testText);
      });
      it('should properly navigate to anchor', async function () {
        const el = await driver.$('=i am an anchor link');
        await el.click();

        // let the click happen
        await delay(500);

        const url = await driver.getUrl();
        await openPage(driver, url);

        assert.ok((await driver.getUrl()).includes('#anchor'));
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
          await openPage(driver, guineaPigIframePage(baseUrl));
          await driver.deleteAllCookies();

          await retryInterval(5, 1000, async function () {
            assert.strictEqual((await driver.getAllCookies()).length, 0);
          });
        });
      });

      describe('within webview', function () {
        describe('insecure', function () {
          beforeEach(async function () {
            await openPage(driver, guineaPigPage(baseUrl));
            await driver.deleteCookie(newCookie.name);
          });

          it('should be able to get cookies for a page', async function () {
            const cookies = await driver.getAllCookies();
            assert.strictEqual(cookies.length, 2);
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
            assert.strictEqual(cookies.length, 0);

            doesNotIncludeCookie(cookies, oldCookie1);
            doesNotIncludeCookie(cookies, oldCookie2);
          });

          describe('native context', function () {
            const notImplementedRegExp = /Method is not implemented/;
            let context: string | null = null;
            beforeEach(async function () {
              context = (await driver.getContext()) as string | null;
              await driver.switchContext('NATIVE_APP');
            });
            afterEach(async function () {
              if (context) {
                await driver.switchContext(context);
              }
            });
            it('should reject all functions', async function () {
              await assert.rejects(driver.addCookie(newCookie), notImplementedRegExp);
              await assert.rejects(driver.getAllCookies(), notImplementedRegExp);
              await assert.rejects(driver.deleteCookie(newCookie.name), notImplementedRegExp);
              await assert.rejects(driver.deleteAllCookies(), notImplementedRegExp);
            });
          });
        });

        describe('secure', function () {
          /*
           * secure cookie tests are in `./safari-ssl-e2e-specs.ts`
           */
        });
      });
    });
  });
});
