import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import B from 'bluebird';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { SAFARI_CAPS } from '../desired';
import { spinTitle, spinTitleEquals, spinWait, GUINEA_PIG_PAGE,
         PHISHING_END_POINT } from './helpers';
import { util } from 'appium-support';


chai.should();
chai.use(chaiAsPromised);
let expect = chai.expect;

let caps = _.defaults({
  safariInitialUrl: GUINEA_PIG_PAGE,
  nativeWebTap: true,
}, SAFARI_CAPS);

describe('Safari', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  describe('init', function () {
    this.retries(3);
    afterEach(async function () {
      await deleteSession();
    });

    it('should start a session with default init', async function () {
      let expectedTitle = process.env.REAL_DEVICE ? 'Appium: Mobile App Automation Made Awesome.'
                                                  : 'Appium/welcome';
      driver = await initSession(SAFARI_CAPS);
      let title = await spinTitle(driver);
      title.should.equal(expectedTitle);
    });

    it('should start a session with custom init', async function () {
      let caps = _.defaults({
        safariInitialUrl: GUINEA_PIG_PAGE
      }, SAFARI_CAPS);
      driver = await initSession(caps);
      let title = await spinTitle(driver);
      title.should.equal('I am a page title');
    });
  });

  describe('basics', function () {
    before(async function () {
      driver = await initSession(_.defaults({
        safariIgnoreFraudWarning: false,
        safariInitialUrl: GUINEA_PIG_PAGE,
        showSafariConsoleLog: true,
      }, caps));
    });
    after(async function () {
      await deleteSession();
    });


    // TODO: in appium-remote-debugger, figure out how to check if a page is loaded
    describe.skip('page load timeouts', function () {
      describe('small timeout, slow page load', function () {
        it('should go to the requested page', async function () {
          await driver.setPageLoadTimeout(3000);
          await driver.get(`${GUINEA_PIG_PAGE}?delay=30000`);

          // the page should not have time to load
          (await driver.source()).should.include('Let\'s browse!');
        });
      });
      describe('no timeout, very slow page', function () {
        let startMs = Date.now();

        it('should go to the requested page', async function () {
          await driver.setCommandTimeout(12000);
          await driver.setPageLoadTimeout(0);
          await driver.get(`${GUINEA_PIG_PAGE}?delay=3000`);

          // the page should load after 70000
          (await driver.source()).should.include('I am some page content');
          (Date.now() - startMs).should.be.above(3000);
        });
      });
    });

    describe('context', function () {
      it('should be able to get current context initially', async function () {
        await B.delay(500);
        (await driver.currentContext()).should.be.ok;
      });
      it('should get full context list through mobile: getContexts', async function () {
        const ctxs = await driver.execute('mobile: getContexts');
        const webviews = ctxs.filter((ctx) => ctx.id !== 'NATIVE_APP');
        webviews.every((ctx) => util.hasValue(ctx.title) && util.hasValue(ctx.url)).should.be.true;
      });
    });

    describe('implicit wait', function () {
      it('should set the implicit wait for finding web elements', async function () {
        await driver.setImplicitWaitTimeout(7 * 1000);

        let before = new Date().getTime() / 1000;
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

        let after = new Date().getTime() / 1000;
        ((after - before) > 7).should.be.ok;
        await driver.setImplicitWaitTimeout(0);
      });
    });

    describe('window title', function () {
      it('should return a valid title on web view', async function () {
        (await driver.title()).should.include("I am a page title");
      });
    });

    describe('element handling', function () {
      beforeEach(async function () {
        await driver.get(GUINEA_PIG_PAGE);
      });

      it('should find a web element in the web view', async function () {
        (await driver.elementById('i_am_an_id')).should.exist;
      });
      it('should find multiple web elements in the web view', async function () {
        (await driver.elementsByTagName('a')).should.have.length.at.least(5);
      });
      it('should fail gracefully to find multiple missing web elements in the web view', async function () {
        (await driver.elementsByTagName('blar')).should.have.length(0);
      });
      it('should find element from another element', async function () {
        let el = await driver.elementByClassName('border');
        (await el.elementByXPath('./form')).should.exist;
      });
      it('should be able to click links', async function () {
        let el = await driver.elementByLinkText('i am a link');
        await el.click();
        await spinTitleEquals(driver, 'I am another page title');
      });
      it('should retrieve an element attribute', async function () {
        let el = await driver.elementById('i_am_an_id');
        (await el.getAttribute('id')).should.be.equal('i_am_an_id');
        expect(await el.getAttribute('blar')).to.be.null;
      });
      it('should retrieve implicit attributes', async function () {
        let els = await driver.elementsByTagName('option');
        els.should.have.length(3);

        (await els[2].getAttribute('index')).should.be.equal('2');
      });
      it('should retrieve an element text', async function () {
        let el = await driver.elementById('i_am_an_id');
        (await el.text()).should.be.equal('I am a div');
      });
      // TODO: figure out what equality means here
      it.skip('should check if two elements are equal', async function () {
        let el1 = await driver.elementById('i_am_an_id');
        let el2 = await driver.elementByCss('#i_am_an_id');
        el1.should.be.equal(el2);
      });
      it('should return the page source', async function () {
        let source = await driver.source();
        source.should.include('<html');
        source.should.include('I am a page title');
        source.should.include('i appear 3 times');
        source.should.include('</html>');
      });
      it('should get current url', async function () {
        (await driver.url()).should.include('test/guinea-pig');
      });
      it('should get updated URL without breaking window handles', async function () {
        let el = await driver.elementByLinkText('i am an anchor link');
        await el.click();

        // allow the click to happen
        await B.delay(500);

        (await driver.url()).should.contain('#anchor');
        (await driver.windowHandles()).should.be.ok;
      });
      it('should send keystrokes to specific element', async function () {
        let el = await driver.elementById('comments');
        await el.clear();
        await el.sendKeys('hello world');
        ['how world', 'hello world'].should.include((await el.getAttribute('value')).toLowerCase());
      });
    });
    describe('element handling', function () {
      beforeEach(async function () {
        await driver.get(GUINEA_PIG_PAGE);
      });

      it('should send keystrokes to active element', async function () {
        let el = await driver.elementById('comments');
        await el.click();
        await el.type('hello world');
        ['how world', 'hello world'].should.include((await el.getAttribute('value')).toLowerCase());
      });
      it('should clear element', async function () {
        let el = await driver.elementById('comments');
        await el.sendKeys('hello world');
        (await el.getAttribute('value')).should.have.length.above(0);
        await el.clear();
        (await el.getAttribute('value')).should.be.equal('');
      });
      it('should say whether an input is selected', async function () {
        let el = await driver.elementById('unchecked_checkbox');
        (await el.isSelected()).should.not.be.ok;
        await el.click();

        // let the click occur
        await B.delay(500);

        (await el.isSelected()).should.be.ok;
      });
      it('should be able to retrieve css properties', async function () {
        let el = await driver.elementById('fbemail');
        (await el.getComputedCss('background-color')).should.be.equal('rgba(255, 255, 255, 1)');
      });
      it('should retrieve an element size', async function () {
        let el = await driver.elementById('i_am_an_id');
        let size = await el.getSize();
        size.width.should.be.above(0);
        size.height.should.be.above(0);
      });
      it('should get location of an element', async function () {
        let el = await driver.elementById('fbemail');
        let loc = await el.getLocation();
        loc.x.should.be.above(0);
        loc.y.should.be.above(0);
      });
      // getTagName not supported by mjwp
      it.skip('should retrieve tag name of an element', async function () {
        let el = await driver.elementById('fbemail');
        let a = await driver.elementByCss('a');
        (await el.getTagName()).should.be.equal('input');
        (await a.getTagName()).should.be.equal('a');
      });
      it('should retrieve a window size', async function () {
        let size = await driver.getWindowSize();
        size.height.should.be.above(0);
        size.width.should.be.above(0);
      });
      it('should move to an arbitrary x-y element and click on it', async function () {
        let el = await driver.elementByLinkText('i am a link');
        await driver.moveTo(el, 5, 15);
        await el.click();
        await spinTitleEquals(driver, 'I am another page title');
      });
      it('should submit a form', async function () {
        let el = await driver.elementById('comments');
        let form = await driver.elementById('jumpContact');
        await el.sendKeys('This is a comment');
        await form.submit();
        await spinWait(async () => {
          let el = await driver.elementById('your_comments');
          (await el.text()).should.be.equal('Your comments: This is a comment');
        });
      });
      it('should return true when the element is displayed', async function () {
        let el = await driver.elementByLinkText('i am a link');
        (await el.isDisplayed()).should.be.ok;
      });
      it('should return false when the element is not displayed', async function () {
        let el = await driver.elementById('invisible div');
        (await el.isDisplayed()).should.not.be.ok;
      });
      it('should return true when the element is enabled', async function () {
        let el = await driver.elementByLinkText('i am a link');
        (await el.isEnabled()).should.be.ok;
      });
      it('should return false when the element is not enabled', async function () {
        let el = await driver.elementById('fbemail');
        await driver.execute(`$('#fbemail').attr('disabled', 'disabled');`);
        (await el.isEnabled()).should.not.be.ok;
      });
      it('should return the active element', async function () {
        let testText = 'hi there';
        let el = await driver.elementById('i_am_a_textbox');
        await el.sendKeys(testText);
        let activeEl = await driver.active();
        (await activeEl.getAttribute('value')).should.be.equal(testText);
      });
      it('should properly navigate to anchor', async function () {
        let el = await driver.elementByLinkText('i am an anchor link');
        await el.click();

        // let the click happen
        await B.delay(500);

        let url = await driver.url();
        await driver.get(url);

        (await driver.url()).should.include('#anchor');
      });
      it('should be able to refresh', async function () {
        await driver.refresh();
      });
    });
    describe('console logging', function () {
      beforeEach(async function () {
        // get the logs to clear anything out
        await driver.log('safariConsole');
      });

      // there can be other things logged, so check that the text is there somewhere
      function checkTexts (logs, expectedTexts) {
        const logText = _.map(logs, (el) => el.text).join(',');
        for (let line of expectedTexts) {
          logText.should.include(line);
        }
      }

      it('should get console logs for JS on the page', async function () {
        // reload the page to execute JS
        await driver.get(GUINEA_PIG_PAGE);

        const logs = await driver.log('safariConsole');
        checkTexts(logs, ['Hello from Appium', 'Loading guinea-pig page', 'Done']);
      });
      it('should get console logs for JS on the page with error', async function () {
        // reload the page to execute JS
        await driver.get(`${GUINEA_PIG_PAGE}?throwError=xcuitest-error`);

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
        let logs2 = await driver.log('safariConsole');
        logs2.should.have.length(1);

        // there should be no overlap
        _.intersection(logs, logs2).should.have.length(0);
      });
    });
  });

  describe('safariIgnoreFraudWarning', function () {
    this.retries(3);

    describe('false', function () {
      beforeEach(async function () {
        driver = await initSession(_.defaults({
          safariIgnoreFraudWarning: false,
        }, caps));
      });
      afterEach(async function () {
        await deleteSession();
      });

      it('should display a phishing warning', async function () {
        await driver.get(PHISHING_END_POINT);
        (await driver.source()).toLowerCase().should.include('phishing');
      });
    });
    describe('true', function () {
      beforeEach(async function () {
        driver = await initSession(_.defaults({
          safariIgnoreFraudWarning: true,
        }, caps));
      });
      afterEach(async function () {
        await deleteSession();
      });

      it('should not display a phishing warning', async function () {
        await driver.get(PHISHING_END_POINT);
        (await driver.source()).toLowerCase().should.not.include('phishing');
      });
    });
  });
});
