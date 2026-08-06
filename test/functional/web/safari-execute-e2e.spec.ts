import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';

import type {Browser} from 'webdriverio';

import {SAFARI_CAPS, amendCapabilities} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';
import {createGuineaPigServerSession, openPage, guineaPigPage} from './helpers/index.js';

const SCROLL_INTO_VIEW = `return arguments[0].scrollIntoView(true);`;
const GET_RIGHT_INNERHTML = `return document.body.innerHTML.indexOf('I am some page content') > 0`;
const GET_WRONG_INNERHTML = `return document.body.innerHTML.indexOf('I am not some page content') > 0`;
const GET_ELEM_BY_TAGNAME = `return document.getElementsByTagName('a');`;

describe('safari - execute -', function () {
  let driver: Browser;
  const guineaPigServer = createGuineaPigServerSession();

  before(async function () {
    const {baseUrl} = await guineaPigServer.setup();
    const caps = amendCapabilities(SAFARI_CAPS, {
      'appium:safariInitialUrl': guineaPigPage(baseUrl),
      'appium:showSafariConsoleLog': true,
    });
    driver = await initSession(caps);
  });
  after(async function () {
    await deleteSession();
    await guineaPigServer.teardown();
  });

  async function runTests(secure = false) {
    describe('mobile: x methods', function () {
      it('should run in native context', async function () {
        await assert.doesNotReject(driver.executeScript('mobile: scroll', [{direction: 'down'}]));
      });
    });

    describe('synchronous', function () {
      it('should bubble up javascript errors', async function () {
        await assert.rejects(driver.executeScript(`'nan'--`, []));
      });

      it('should eval javascript', async function () {
        assert.strictEqual(await driver.executeScript('return 1 + 1', []), 2);
      });

      it('should not be returning hardcoded results', async function () {
        assert.strictEqual(await driver.executeScript('return 1+1', []), 2);
      });

      it(`should return nothing when you don't explicitly return`, async function () {
        assert.ok(!(await driver.executeScript('1+1', [])));
      });

      if (!secure) {
        it('should execute code inside the web view', async function () {
          assert.ok(await driver.executeScript(GET_RIGHT_INNERHTML, []));
          assert.ok(!(await driver.executeScript(GET_WRONG_INNERHTML, [])));
        });

        it('should convert selenium element arg to webview element', async function () {
          const el = await driver.findElement('id', 'useragent');
          await driver.executeScript(SCROLL_INTO_VIEW, [el]);
        });

        it('should catch stale or undefined element as arg', async function () {
          const el = await driver.findElement('id', 'useragent');
          await assert.rejects(driver.executeScript(SCROLL_INTO_VIEW, [{ELEMENT: (el as any).value + 1}]));
        });

        it('should be able to return multiple elements from javascript', async function () {
          const result = await driver.executeScript(GET_ELEM_BY_TAGNAME, []);
          assert.ok((result as any[]).length > 0);
        });
      }

      it('should pass along non-element arguments', async function () {
        const arg = 'non-element-argument';
        assert.strictEqual(
          await driver.executeScript('var args = Array.prototype.slice.call(arguments, 0); return args[0];', [arg]),
          arg,
        );
      });

      it('should handle return values correctly', async function () {
        const arg = ['one', 'two', 'three'];
        assert.deepStrictEqual(
          await driver.executeScript('var args = Array.prototype.slice.call(arguments, 0); return args;', arg),
          arg,
        );
      });
    });

    // TODO: Update for WdIO compatibility
    // describe('asynchronous', function () {
    //   it('should execute async javascript', async function () {
    //     await driver.setAsyncScriptTimeout(1000);
    //     await driver.executeAsync(`arguments[arguments.length - 1](123);`)
    //       .should.eventually.equal(123);
    //   });

    //   it('should bubble up errors', async function () {
    //     await driver.executeAsync(`arguments[arguments.length - 1]('nan'--);`)
    //       .should.be.rejectedWith(/operator applied to value that is not a reference/);
    //   });

    //   it('should timeout when callback is not invoked', async function () {
    //     await driver.setAsyncScriptTimeout(1000);
    //     await driver.executeAsync(`return 1 + 2`)
    //       .should.be.rejectedWith(/Timed out waiting for/);
    //   });
    // });
  }

  describe('http', function () {
    runTests();

    // TODO: Update for WdIO compatibility
    //   describe('cors', function () {
    //     let server;
    //     const host = '127.0.0.1';
    //     const port = 8080;
    //     before(function () {
    //       // create an http server so we can test CORS handling without
    //       // going to an external site
    //       server = http.createServer(function (req, res) {
    //         res.writeHead(200, {'Content-Type': 'text/html'});
    //         res.write('appium-xcuitest-driver async execute tests');
    //         res.end();
    //       }).listen({host, port});
    //     });
    //     after(function () {
    //       if (server) {
    //         server.close();
    //       }
    //     });

    //     it('should execute async javascript from a different site', async function () {
    //       await driver.navigateTo(`http://${host}:${port}`);
    //       await driver.setAsyncScriptTimeout(1000);
    //       await driver.executeAsync(`arguments[arguments.length - 1](123);`)
    //         .should.eventually.equal(123);
    //     });
    //   });
  });

  describe('https', function () {
    before(async function () {
      await openPage(driver, 'https://google.com');
    });
    runTests(true);
  });
});
