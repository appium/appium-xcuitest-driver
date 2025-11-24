import {SAFARI_CAPS, amendCapabilities} from '../desired';
import {initSession, deleteSession, MOCHA_TIMEOUT} from '../helpers/session';
import {openPage, GUINEA_PIG_PAGE} from './helpers';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

const SCROLL_INTO_VIEW = `return arguments[0].scrollIntoView(true);`;
const GET_RIGHT_INNERHTML = `return document.body.innerHTML.indexOf('I am some page content') > 0`;
const GET_WRONG_INNERHTML = `return document.body.innerHTML.indexOf('I am not some page content') > 0`;
const GET_ELEM_BY_TAGNAME = `return document.getElementsByTagName('a');`;

describe('safari - execute -', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  before(async function () {
    const caps = amendCapabilities(SAFARI_CAPS, {
      'appium:safariInitialUrl': GUINEA_PIG_PAGE,
      'appium:showSafariConsoleLog': true,
    });
    driver = await initSession(caps);
  });
  after(async function () {
    await deleteSession();
  });

  async function runTests(secure = false) {
    describe('mobile: x methods', function () {
      it('should run in native context', async function () {
        await expect(driver.executeScript('mobile: scroll', [{direction: 'down'}])).to.not.be.rejected;
      });
    });

    describe('synchronous', function () {
      it('should bubble up javascript errors', async function () {
        await expect(driver.executeScript(`'nan'--`, [])).to.be.rejected;
      });

      it('should eval javascript', async function () {
        await expect(driver.executeScript('return 1 + 1', [])).to.eventually.equal(2);
      });

      it('should not be returning hardcoded results', async function () {
        await expect(driver.executeScript('return 1+1', [])).to.eventually.equal(2);
      });

      it(`should return nothing when you don't explicitly return`, async function () {
        expect(await driver.executeScript('1+1', [])).to.not.exist;
      });

      if (!secure) {
        it('should execute code inside the web view', async function () {
          await expect(driver.executeScript(GET_RIGHT_INNERHTML, [])).to.eventually.be.ok;
          await expect(driver.executeScript(GET_WRONG_INNERHTML, [])).to.eventually.not.be.ok;
        });

        it('should convert selenium element arg to webview element', async function () {
          const el = await driver.findElement('id', 'useragent');
          await driver.executeScript(SCROLL_INTO_VIEW, [el]);
        });

        it('should catch stale or undefined element as arg', async function () {
          const el = await driver.findElement('id', 'useragent');
          await expect(driver.executeScript(SCROLL_INTO_VIEW, [{ELEMENT: el.value + 1}])).to.be
            .rejected;
        });

        it('should be able to return multiple elements from javascript', async function () {
          await expect(driver
            .executeScript(GET_ELEM_BY_TAGNAME, [])
          ).to.eventually.have.length.above(0);
        });
      }

      it('should pass along non-element arguments', async function () {
        const arg = 'non-element-argument';
        await expect(driver
          .executeScript('var args = Array.prototype.slice.call(arguments, 0); return args[0];', [
            arg,
          ])
        ).to.eventually.equal(arg);
      });

      it('should handle return values correctly', async function () {
        const arg = ['one', 'two', 'three'];
        await expect(driver
          .executeScript('var args = Array.prototype.slice.call(arguments, 0); return args;', arg)
        ).to.eventually.eql(arg);
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

