import B from 'bluebird';
import _ from 'lodash';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { killAllSimulators } from '../helpers/simulator';
import { SAFARI_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import { spinTitleEquals, GUINEA_PIG_PAGE, GUINEA_PIG_FRAME_PAGE,
         GUINEA_PIG_IFRAME_PAGE } from './helpers';


chai.should();
chai.use(chaiAsPromised);

const GET_ELEM_SYNC = `return document.getElementsByTagName('h1')[0].innerHTML;`;
const GET_ELEM_ASYNC = `arguments[arguments.length - 1](document.getElementsByTagName('h1')[0].innerHTML);`;

const FRAMESET_TITLE = 'Frameset guinea pig';
const IFRAME_FRAMESET_TITLE = 'Iframe guinea pig';
const SUB_FRAME_1_TITLE = 'Sub frame 1';
const SUB_FRAME_2_TITLE = 'Sub frame 2';
const SUB_FRAME_3_TITLE = 'Sub frame 3';

describe('safari - windows and frames - without safariAllowPopups', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async function () {
    if (!process.env.REAL_DEVICE) {
      await killAllSimulators();
    }
    let caps = _.defaults({
      safariInitialUrl: GUINEA_PIG_PAGE,
      safariAllowPopups: false,
      nativeWebTap: true,
    }, SAFARI_CAPS);
    driver = await initSession(caps);
    await driver.setPageLoadTimeout(100);
  });
  after(async function () {
    await deleteSession();
  });

  it('should not be able to open js popup windows', async function () {
    await driver.execute("window.open('/test/guinea-pig2.html', null)");
    await spinTitleEquals(driver, 'I am another page title', 5).should.eventually.be.rejected;
  });
});

describe('safari - windows and frames', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async function () {
    if (!process.env.REAL_DEVICE) {
      await killAllSimulators();
    }
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

  describe('windows', function () {
    before(async function () {
      // minimize waiting if something goes wrong
      await driver.setImplicitWaitTimeout(1000);
    });

    it('should throw nosuchwindow if there is not one', async function () {
      await driver.window('noexistman').should.eventually.be.rejectedWith(/window could not be found/);
    });

    it('should be able to open and close windows', async function () {
      let el = await driver.elementById('blanklink');
      await el.click();
      await spinTitleEquals(driver, 'I am another page title');

      await B.delay(2000);
      await driver.close();
      await B.delay(3000);
      await spinTitleEquals(driver, 'I am a page title');
    });

    it('should be able to go back and forward', async function () {
      let link = await driver.elementByLinkText('i am a link');
      await link.click();
      await driver.elementById('only_on_page_2');
      await driver.back();
      await driver.elementById('i_am_a_textbox');
      await driver.forward();
      await driver.elementById('only_on_page_2');
      await driver.back();
    });

    // broken on real devices, see https://github.com/appium/appium/issues/5167
    it('should be able to open js popup windows with safariAllowPopups set to true @skip-real-device', async function () {
      let link = await driver.elementByLinkText('i am a new window link');
      await link.click();
      await spinTitleEquals(driver, 'I am another page title', 30);
    });
  });

  describe('frames', function () {
    beforeEach(async function () {
      await driver.get(GUINEA_PIG_FRAME_PAGE);
    });

    it('should switch to frame by name', async function () {
      await driver.frame('first');
      (await driver.title()).should.be.equal(FRAMESET_TITLE);

      let h1 = await driver.elementByTagName('h1');
      (await h1.text()).should.be.equal(SUB_FRAME_1_TITLE);
    });

    it('should switch to frame by index', async function () {
      await driver.frame(1);
      (await driver.title()).should.be.equal(FRAMESET_TITLE);

      let h1 = await driver.elementByTagName('h1');
      (await h1.text()).should.be.equal(SUB_FRAME_2_TITLE);
    });

    it('should switch to frame by id', async function () {
      await driver.frame('frame3');
      (await driver.title()).should.be.equal(FRAMESET_TITLE);

      let h1 = await driver.elementByTagName('h1');
      (await h1.text()).should.be.equal(SUB_FRAME_3_TITLE);
    });

    it('should switch back to default content from frame', async function () {
      await driver.frame('first');
      (await driver.title()).should.be.equal(FRAMESET_TITLE);

      let h1 = await driver.elementByTagName('h1');
      (await h1.text()).should.be.equal(SUB_FRAME_1_TITLE);

      await driver.frame(null);
      (await driver.elementByTagName('frameset')).should.exist;
    });

    it('should switch to child frames', async function () {
      await driver.frame('third');
      (await driver.title()).should.be.equal(FRAMESET_TITLE);

      await driver.frame('childframe');
      (await driver.elementById('only_on_page_2')).should.exist;
    });

    it('should execute javascript in frame', async function () {
      await driver.frame('first');
      (await driver.execute(GET_ELEM_SYNC)).should.be.equal(SUB_FRAME_1_TITLE);
    });

    it.skip('should execute async javascript in frame', async function () {
      await driver.frame('first');
      (await driver.executeAsync(GET_ELEM_ASYNC)).should.be.equal(SUB_FRAME_1_TITLE);
    });

    it('should get source within a frame', async function () {
      let pageSource = await driver.source();
      pageSource.should.include(FRAMESET_TITLE);

      await driver.frame('first');

      let frameSource = await driver.source();
      frameSource.should.include(SUB_FRAME_1_TITLE);
      frameSource.should.not.include(FRAMESET_TITLE);
    });
  });

  describe('iframes', function () {
    beforeEach(async function () {
      await driver.get(GUINEA_PIG_IFRAME_PAGE);
    });

    it('should switch to iframe by name', async function () {
      await driver.frame('iframe1');
      (await driver.title()).should.be.equal(IFRAME_FRAMESET_TITLE);

      let h1 = await driver.elementByTagName('h1');
      (await h1.text()).should.be.equal(SUB_FRAME_1_TITLE);
    });

    it('should switch to iframe by index', async function () {
      await driver.frame(1);
      (await driver.title()).should.be.equal(IFRAME_FRAMESET_TITLE);

      let h1 = await driver.elementByTagName('h1');
      (await h1.text()).should.be.equal(SUB_FRAME_2_TITLE);
    });

    it('should switch to iframe by id', async function () {
      await driver.frame('id-iframe3');
      (await driver.title()).should.be.equal(IFRAME_FRAMESET_TITLE);

      let h1 = await driver.elementByTagName('h1');
      (await h1.text()).should.be.equal(SUB_FRAME_3_TITLE);
    });

    it('should switch to iframe by element', async function () {
      let frame = await driver.elementById('id-iframe3');
      await driver.frame(frame);
      (await driver.title()).should.be.equal(IFRAME_FRAMESET_TITLE);

      let h1 = await driver.elementByTagName('h1');
      (await h1.text()).should.be.equal(SUB_FRAME_3_TITLE);
    });

    it('should not switch to iframe by element of wrong type', async function () {
      let h1 = await driver.elementByTagName('h1');
      await driver.frame(h1).should.eventually.be.rejected;
    });

    it('should switch back to default content from iframe', async function () {
      await driver.frame('iframe1');
      (await driver.title()).should.be.equal(IFRAME_FRAMESET_TITLE);

      let h1 = await driver.elementByTagName('h1');
      (await h1.text()).should.be.equal(SUB_FRAME_1_TITLE);

      await driver.frame(null);
      (await driver.elementsByTagName('iframe')).should.have.length(3);
    });

    it('should get source within an iframe', async function () {
      let pageSource = await driver.source();
      pageSource.should.include(IFRAME_FRAMESET_TITLE);

      await driver.frame('iframe1');

      let frameSource = await driver.source();
      frameSource.should.include(SUB_FRAME_1_TITLE);
      frameSource.should.not.include(IFRAME_FRAMESET_TITLE);
    });
  });
});
