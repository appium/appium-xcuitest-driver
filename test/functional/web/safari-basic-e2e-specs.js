import { startServer } from '../../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';
import _ from 'lodash';
import B from 'bluebird';
import { HOST, PORT, MOCHA_TIMEOUT } from '../helpers/session';
import { SAFARI_CAPS } from '../desired';
import { spinTitle, spinTitleEquals, spinWait, GUINEA_PIG_PAGE,
         PHISHING_END_POINT, GUINEA_PIG_SCROLLABLE_PAGE,
         GUINEA_PIG_APP_BANNER_PAGE } from './helpers';
import { killAllSimulators } from 'appium-ios-simulator';


chai.should();
chai.use(chaiAsPromised);
let expect = chai.expect;

let caps = _.defaults({
  safariInitialUrl: GUINEA_PIG_PAGE,
  nativeWebTap: true,
}, SAFARI_CAPS);

describe('Safari', function () {
  this.timeout(MOCHA_TIMEOUT);

  let server, driver;
  before(async () => {
    driver = wd.promiseChainRemote(HOST, PORT);
    server = await startServer(PORT, HOST);
  });

  after(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('init', () => {
    afterEach(async function () {
      await driver.quit();
    });

    it('should start a session with default init', async function () {
      let expectedTitle = process.env.REAL_DEVICE ? 'Appium: Mobile App Automation Made Awesome.'
                                                  : 'Appium/welcome';
      await driver.init(SAFARI_CAPS);
      let title = await spinTitle(driver);
      title.should.equal(expectedTitle);
    });

    it('should start a session with custom init', async function () {
      let caps = _.defaults({
        safariInitialUrl: GUINEA_PIG_PAGE
      }, SAFARI_CAPS);
      await driver.init(caps);
      let title = await spinTitle(driver);
      title.should.equal('I am a page title');
    });
  });

  describe('basics', () => {
    before(async () => {
      await driver.init(_.defaults({
        safariIgnoreFraudWarning: false,
        safariInitialUrl: GUINEA_PIG_PAGE,
      }, caps));
    });
    after(async () => {
      await driver.quit();
    });


    // TODO: in appium-remote-debugger, figure out how to check if a page is loaded
    describe.skip('page load timeouts', () => {
      describe('small timeout, slow page load', function () {
        it('should go to the requested page', async () => {
          await driver.setPageLoadTimeout(3000);
          await driver.get(`${GUINEA_PIG_PAGE}?delay=30000`);

          // the page should not have time to load
          (await driver.source()).should.include('Let\'s browse!');
        });
      });
      describe('no timeout, very slow page', function () {
        let startMs = Date.now();

        it('should go to the requested page', async () => {
          await driver.setCommandTimeout(12000);
          await driver.setPageLoadTimeout(0);
          await driver.get(`${GUINEA_PIG_PAGE}?delay=3000`);

          // the page should load after 70000
          (await driver.source()).should.include('I am some page content');
          (Date.now() - startMs).should.be.above(3000);
        });
      });
    });

    describe('context', () => {
      it('getting current context should work initially', async () => {
        await B.delay(500);
        (await driver.currentContext()).should.be.ok;
      });
    });

    describe('implicit wait', () => {
      it('should set the implicit wait for finding web elements', async () => {
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

    describe('window title', () => {
      it('should return a valid title on web view', async () => {
        (await driver.title()).should.include("I am a page title");
      });
    });

    describe('element handling', function () {
      beforeEach(async () => {
        await driver.get(GUINEA_PIG_PAGE);
      });

      it('should find a web element in the web view', async () => {
        (await driver.elementById('i_am_an_id')).should.exist;
      });
      it('should find multiple web elements in the web view', async () => {
        (await driver.elementsByTagName('a')).should.have.length.at.least(5);
      });
      it('should fail gracefully to find multiple missing web elements in the web view', async () => {
        (await driver.elementsByTagName('blar')).should.have.length(0);
      });
      it('should find element from another element', async () => {
        let el = await driver.elementByClassName('border');
        (await el.elementByXPath('./form')).should.exist;
      });
      it('should be able to click links', async () => {
        let el = await driver.elementByLinkText('i am a link');
        await el.click();
        await spinTitleEquals(driver, 'I am another page title');
      });
      it('should retrieve an element attribute', async () => {
        let el = await driver.elementById('i_am_an_id');
        (await el.getAttribute('id')).should.be.equal('i_am_an_id');
        expect(await el.getAttribute('blar')).to.be.null;
      });
      it('should retrieve implicit attributes', async () => {
        let els = await driver.elementsByTagName('option');
        els.should.have.length(3);

        (await els[2].getAttribute('index')).should.be.equal('2');
      });
      it('should retrieve an element text', async () => {
        let el = await driver.elementById('i_am_an_id');
        (await el.text()).should.be.equal('I am a div');
      });
      // TODO: figure out what equality means here
      it.skip('should check if two elements are equal', async () => {
        let el1 = await driver.elementById('i_am_an_id');
        let el2 = await driver.elementByCss('#i_am_an_id');
        el1.should.be.equal(el2);
      });
      it('should return the page source', async () => {
        let source = await driver.source();
        source.should.include('<html');
        source.should.include('I am a page title');
        source.should.include('i appear 3 times');
        source.should.include('</html>');
      });
      it('should get current url', async () => {
        (await driver.url()).should.include('test/guinea-pig');
      });
      it('should get updated URL without breaking window handles', async () => {
        let el = await driver.elementByLinkText('i am an anchor link');
        await el.click();
        (await driver.url()).should.contain('#anchor');
        (await driver.windowHandles()).should.be.ok;
      });
      it('should send keystrokes to specific element', async () => {
        let el = await driver.elementById('comments');
        await el.clear();
        await el.sendKeys('hello world');
        ['how world', 'hello world'].should.include((await el.getAttribute('value')).toLowerCase());
      });
    });
    describe('element handling', function () {
      beforeEach(async () => {
        await driver.get(GUINEA_PIG_PAGE);
      });

      it('should send keystrokes to active element', async () => {
        let el = await driver.elementById('comments');
        await el.click();
        await el.type('hello world');
        ['how world', 'hello world'].should.include((await el.getAttribute('value')).toLowerCase());
      });
      it('should clear element', async () => {
        let el = await driver.elementById('comments');
        await el.sendKeys('hello world');
        (await el.getAttribute('value')).should.have.length.above(0);
        await el.clear();
        (await el.getAttribute('value')).should.be.equal('');
      });
      it('should say whether an input is selected', async () => {
        let el = await driver.elementById('unchecked_checkbox');
        (await el.isSelected()).should.not.be.ok;
        await el.click();
        (await el.isSelected()).should.be.ok;
      });
      it('should be able to retrieve css properties', async () => {
        let el = await driver.elementById('fbemail');
        (await el.getComputedCss('background-color')).should.be.equal('rgba(255, 255, 255, 1)');
      });
      it('should retrieve an element size', async () => {
        let el = await driver.elementById('i_am_an_id');
        let size = await el.getSize();
        size.width.should.be.above(0);
        size.height.should.be.above(0);
      });
      it('should get location of an element', async () => {
        let el = await driver.elementById('fbemail');
        let loc = await el.getLocation();
        loc.x.should.be.above(0);
        loc.y.should.be.above(0);
      });
      // getTagName not supported by mjwp
      it.skip('should retrieve tag name of an element', async () => {
        let el = await driver.elementById('fbemail');
        let a = await driver.elementByCss('a');
        (await el.getTagName()).should.be.equal('input');
        (await a.getTagName()).should.be.equal('a');
      });
      it('should retrieve a window size', async () => {
        let size = await driver.getWindowSize();
        size.height.should.be.above(0);
        size.width.should.be.above(0);
      });
      it('should move to an arbitrary x-y element and click on it', async () => {
        let el = await driver.elementByLinkText('i am a link');
        await driver.moveTo(el, 5, 15);
        await el.click();
        await spinTitleEquals(driver, 'I am another page title');
      });
      it('should submit a form', async () => {
        let el = await driver.elementById('comments');
        let form = await driver.elementById('jumpContact');
        await el.sendKeys('This is a comment');
        await form.submit();
        await spinWait(async () => {
          let el = await driver.elementById('your_comments');
          (await el.text()).should.be.equal('Your comments: This is a comment');
        });
      });
      it('should return true when the element is displayed', async () => {
        let el = await driver.elementByLinkText('i am a link');
        (await el.isDisplayed()).should.be.ok;
      });
      it('should return false when the element is not displayed', async () => {
        let el = await driver.elementById('invisible div');
        (await el.isDisplayed()).should.not.be.ok;
      });
      it('should return true when the element is enabled', async () => {
        let el = await driver.elementByLinkText('i am a link');
        (await el.isEnabled()).should.be.ok;
      });
      it('should return false when the element is not enabled', async () => {
        let el = await driver.elementById('fbemail');
        await driver.execute(`$('#fbemail').attr('disabled', 'disabled');`);
        (await el.isEnabled()).should.not.be.ok;
      });
      it('should return the active element', async () => {
        let testText = 'hi there';
        let el = await driver.elementById('i_am_a_textbox');
        await el.sendKeys(testText);
        let activeEl = await driver.active();
        (await activeEl.getAttribute('value')).should.be.equal(testText);
      });
      it('should properly navigate to anchor', async () => {
        let el = await driver.elementByLinkText('i am an anchor link');
        await el.click();

        let url = await driver.url();
        await driver.get(url);

        (await driver.url()).should.include('#anchor');
      });
      it('should be able to refresh', async () => {
        await driver.refresh();
      });
    });
  });
  describe('nativeWebTap coordinate conversion - iPad -', function () {
    before(async () => {
      await driver.init(_.defaults({
        deviceName: 'iPad Simulator',
        fullReset: true,
        noReset: false,
      }, caps));
      await driver.setImplicitWaitTimeout(5000);
    });
    after(async function () {
      await driver.quit();
      await killAllSimulators();
    });

    it('should be able to tap on an element when the app banner is up', async function () {
      await driver.get(GUINEA_PIG_APP_BANNER_PAGE);

      let el = await driver.elementByLinkText('i am a link to page 3');
      await el.click();

      await spinTitleEquals(driver, 'Another Page: page 3');
    });

    it('should be able to tap on an element after scrolling', async function () {
      await driver.get(GUINEA_PIG_SCROLLABLE_PAGE);
      await driver.execute('mobile: scroll', {direction: 'down'});

      let el = await driver.elementByLinkText('i am a link to page 3');
      await el.click();

      await spinTitleEquals(driver, 'Another Page: page 3');
    });

    describe('with tabs', function () {
      beforeEach(async function () {
        await driver.get(GUINEA_PIG_PAGE);

        // open a new tab and go to it
        let el = await driver.elementByLinkText('i am a new window link');
        await el.click();
      });
      afterEach(async function () {
        await driver.close();
        let contexts = await driver.contexts();
        contexts.should.have.length.at.least(2);
        await driver.context(contexts[1]);
      });

      it('should be able to tap on an element', async function () {
        // get the correct page
        await driver.get(GUINEA_PIG_PAGE);

        let el = await driver.elementByLinkText('i am a link to page 3');
        await el.click();

        await spinTitleEquals(driver, 'Another Page: page 3');

        await driver.back();

        // try again, just to make sure
        el = await driver.elementByLinkText('i am a link to page 3');
        await el.click();

        await spinTitleEquals(driver, 'Another Page: page 3');
      });
      it('should be able to tap on an element after scrolling', async function () {
        await driver.get(GUINEA_PIG_SCROLLABLE_PAGE);
        await driver.execute('mobile: scroll', {direction: 'down'});

        let el = await driver.elementByLinkText('i am a link to page 3');
        await el.click();

        await spinTitleEquals(driver, 'Another Page: page 3');
      });
      it('should be able to tap on an element after scrolling, when the url bar is present', async function () {
        await driver.get(GUINEA_PIG_SCROLLABLE_PAGE);
        await driver.execute('mobile: scroll', {direction: 'down'});

        let el = await driver.elementByLinkText('i am a link to page 3');
        await el.click();

        await spinTitleEquals(driver, 'Another Page: page 3');

        // going back will reveal the full url bar
        await driver.back();

        // make sure we get the correct position again
        el = await driver.elementByLinkText('i am a link to page 3');
        await el.click();

        await spinTitleEquals(driver, 'Another Page: page 3');
      });
    });
  });

  describe('safariIgnoreFraudWarning', () => {
    describe('false', function () {
      before(async () => {
        await driver.init(_.defaults({
          safariIgnoreFraudWarning: false,
        }, caps));
      });
      after(async () => {
        await driver.quit();
      });

      it('should display a phishing warning', async () => {
        await driver.get(`${PHISHING_END_POINT}/guinea-pig2.html`);
        (await driver.source()).toLowerCase().should.include('phishing');
      });
    });
    describe('true', function () {
      before(async () => {
        await driver.init(_.defaults({
          safariIgnoreFraudWarning: true,
        }, caps));
      });
      after(async () => {
        await driver.quit();
      });

      it('should display a phishing warning', async () => {
        await driver.get(`${PHISHING_END_POINT}/guinea-pig2.html`);
        (await driver.source()).toLowerCase().should.not.include('phishing');
      });
    });
  });
});
