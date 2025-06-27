import B from 'bluebird';
import util from 'util';
import {retryInterval} from 'asyncbox';
import {
  amendCapabilities,
  isIosVersionBelow,
  UICATALOG_CAPS
} from '../desired';
import {initSession, deleteSession, hasDefaultPrebuiltWDA, MOCHA_TIMEOUT} from '../helpers/session';
import {GUINEA_PIG_PAGE} from '../web/helpers';
import sharp from 'sharp';


describe('XCUITestDriver - basics -', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    const caps = amendCapabilities(UICATALOG_CAPS, {
      'appium:usePrebuiltWDA': hasDefaultPrebuiltWDA(),
    });
    driver = await initSession(caps);
  });
  after(async function () {
    await deleteSession();
  });

  describe('status -', function () {
    it('should get the server status', async function () {
      let status = await driver.status();
      status.build.version.should.exist;
    });

    it('should return status immediately if another operation is in progress', async function () {
      await driver.setTimeout({ implicit: 10000 });
      const findElementPromise = driver.$('#WrongLocator');
      const status = await driver.status();
      status.build.version.should.exist;
      util.inspect(findElementPromise).includes('pending').should.be.true;
      try {
        await findElementPromise;
      } catch (err) {
        err.status.should.eql(7);
      }
    });
  });

  describe('source -', function () {
    function checkSource(src) {
      // should have full elements
      src.should.include('<AppiumAUT>');
      src.should.include('<XCUIElementTypeApplication');

      // should not have any XCTest errors
      src.should.not.include('AX error');
    }
    describe('plain -', function () {
      it('should get the source for the page', async function () {
        let src = await driver.getPageSource();
        (typeof src).should.eql('string');
        checkSource(src);
      });
    });
    describe('json parsed -', function () {
      it('should get source with useJSONSource', async function () {
        await driver.updateSettings({useJSONSource: true});
        let src = await driver.getPageSource();
        checkSource(src);
      });
    });
  });

  describe('deactivate app -', function () {
    it('should background the app for the specified time', async function () {
      let before = Date.now();
      await driver.background(4);
      (Date.now() - before).should.be.above(4000);
      (await driver.getPageSource()).indexOf('<AppiumAUT>').should.not.eql(-1);
    });
  });

  describe('screenshot -', function () {
    after(async function () {
      try {
        await driver.setOrientation('PORTRAIT');
      } catch {}
    });
    it('should get an app screenshot', async function () {
      let screenshot = await driver.takeScreenshot();
      screenshot.should.exist;
      screenshot.should.be.a('string');

      // make sure WDA didn't crash, by using it again
      let els = await driver.$$('~Alert Views');
      els.length.should.eql(1);
    });

    it('should get an app screenshot in landscape mode', async function () {
      let screenshot1 = await driver.takeScreenshot();
      screenshot1.should.exist;

      try {
        await driver.setOrientation('LANDSCAPE');
      } catch {}
      // take a little pause while it orients, otherwise you get the screenshot
      // on an angle
      await B.delay(500);

      let screenshot2 = await driver.takeScreenshot();
      screenshot2.should.exist;
      screenshot2.should.not.eql(screenshot1);
    });
  });

  describe('viewportScreenshot -', function () {
    it('should get a cropped screenshot of the viewport without statusbar', async function () {
      if (process.env.CI) {
        // Skip on GHA. Local had no issue but GHA had failed in 'mobile: viewportScreenshot'.
        return this.skip();
      }

      const {statusBarSize, scale} = await driver.execute('mobile: deviceScreenInfo');
      const viewportRect = await driver.execute('mobile: viewportRect');
      const fullScreen = await driver.takeScreenshot();
      const viewScreen = await driver.execute('mobile: viewportScreenshot');
      const fullImg = sharp(Buffer.from(fullScreen, 'base64'));
      const {width: fullImgWidth, height: fullImgHeight} = await fullImg.metadata();
      const viewImg = sharp(Buffer.from(viewScreen, 'base64'));
      const {width: viewImgWidth, height: viewImgHeight} = await viewImg.metadata();
      if (
        fullImgWidth === undefined ||
        fullImgHeight === undefined ||
        viewImgWidth === undefined ||
        viewImgHeight === undefined
      ) {
        throw new Error('Image dimensions must not be undefined');
      }
      // Viewport size can be smaller than the full image size + status bar on some devices.
      fullImgHeight.should.be.gte(viewImgHeight + Math.round(scale * statusBarSize.height));
      viewImgHeight.should.eql(viewportRect.height);
      fullImgWidth.should.be.gte(viewImgWidth);
    });
  });

  describe('logging -', function () {
    describe('types -', function () {
      it('should get the list of available logs', async function () {
        const expectedTypes = ['syslog', 'crashlog', 'performance', 'safariConsole', 'safariNetwork', 'server'];
        const actualTypes = await driver.getLogTypes();
        for (const expectedType of ['syslog', 'crashlog', 'performance', 'server', 'safariConsole']) {
          actualTypes.should.include(expectedType);
        }
      });
    });

    describe('retrieval -', function () {
      it('should throw an error when an invalid type is given', async function () {
        await driver.getLogs('something-random').should.be.rejected;
      });
      it('should get system logs', async function () {
        (await driver.getLogs('syslog')).should.be.an('array');
      });
      it('should get crash logs', async function () {
        (await driver.getLogs('crashlog')).should.be.an('array');
      });
    });
  });

  describe('orientation -', function () {
    beforeEach(async function () {
      await driver.setOrientation('PORTRAIT');
    });
    afterEach(async function () {
      await driver.setOrientation('PORTRAIT');
    });
    it('should get the current orientation', async function () {
      let orientation = await driver.getOrientation();
      ['PORTRAIT', 'LANDSCAPE'].should.include(orientation);
    });
    it('should set the orientation', async function () {
      await driver.setOrientation('LANDSCAPE');

      (await driver.getOrientation()).should.eql('LANDSCAPE');
    });
    it('should be able to interact with an element in LANDSCAPE', async function () {
      await driver.setOrientation('LANDSCAPE');

      let el = await driver.$('#Buttons');
      await el.click();

      await driver.findElement('css selector', '#Button').should.not.be.rejected;

      await driver.back();
    });
  });

  describe('window size -', function () {
    it('should be able to get the current window size', async function () {
      let size = await driver.getWindowRect();
      size.width.should.be.a('number');
      size.height.should.be.a('number');
    });
  });

  describe('geo location -', function () {
    it('should work on Simulator', async function () {
      await driver.execute('mobile: getSimulatedLocation').should.be.fulfilled;
      await driver.execute('mobile: setSimulatedLocation', {latitude: '30.0001', longitude: '21.0002'}).should.not.be
        .rejected;
    });
  });

  describe('shake -', function () {
    it('should work on Simulator', async function () {
      await driver.execute('mobile: shake').should.be.fulfilled;
    });
  });

  describe('lock -', function () {
    it('should properly lock and unlock the device', async function () {
      try {
        await driver.lock();
        (await driver.isLocked()).should.be.true;
      } finally {
        await driver.unlock();
      }
      (await driver.isLocked()).should.be.false;
    });
  });

  describe('contexts -', function () {
    before(async function () {
      await driver.execute('mobile: scroll', {direction: 'down'});
      await driver.$('~Web View').click();
    });
    after(async function () {
      await driver.back();
      await driver.execute('mobile: scroll', {direction: 'up'});
    });

    it('should start a session, navigate to url, get title', async function () {
      if (process.env.CI && isIosVersionBelow('18.0')) {
        this.skip();
      }
      const contexts = await driver.execute('mobile: getContexts', {waitForWebviewMs: 10000});
      if (process.env.CI && contexts.length < 2) {
        // Skip on CI, since the simulator may be too slow to fetch a webview context in time
        return this.skip();
      }

      await driver.switchContext(contexts[1].id);
      await driver.navigateTo(GUINEA_PIG_PAGE);

      await retryInterval(100, 1000, async function () {
        let title = await driver.getTitle();
        title.should.equal('I am a page title');
      });

      await driver.switchContext(contexts[0].id);
    });
  });
});
