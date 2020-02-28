import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import B from 'bluebird';
import { retryInterval } from 'asyncbox';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import { GUINEA_PIG_PAGE } from '../web/helpers';
import { PNG } from 'pngjs';


chai.should();
chai.use(chaiAsPromised);
chai.use(chaiSubset);

describe('XCUITestDriver - basics -', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async function () {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(async function () {
    await deleteSession();
  });

  describe('status -', function () {
    it('should get the server status', async function () {
      let status = await driver.status();
      if (process.env.SAUCE_EMUSIM) {
        status.build.version.should.equal('Sauce Labs');
      } else {
        status.wda.should.exist;
      }
    });

    it('should return status immediately if another operation is in progress', async function () {
      // Sauce EmuSim/RDC don't seem to support getting status and running an operation concurrently
      if (process.env.CLOUD) {
        this.skip();
      }

      await driver.setImplicitWaitTimeout(10000);
      const findElementPromise = driver.elementById('WrongLocator');
      const status = await driver.status();
      status.wda.should.exist;
      findElementPromise.isPending().should.be.true;
      try {
        await findElementPromise;
      } catch (err) {
        err.status.should.eql(7);
      }
    });
  });

  describe('session -', function () {
    it('should get session details with our caps merged with WDA response', async function () {
      if (process.env.SAUCE_EMUSIM) {
        // Sauce adds extraneous caps that are hard to test
        this.skip();
      }
      const extraWdaCaps = {
        CFBundleIdentifier: 'com.example.apple-samplecode.UICatalog',
        device: 'iphone',
      };
      let expected = Object.assign({}, UICATALOG_CAPS, extraWdaCaps);

      let actual = await driver.sessionCapabilities();
      // `borwserName` can be different
      ['UICatalog', 'UIKitCatalog'].should.include(actual.browserName);
      delete actual.browserName;
      // don't really know a priori what the udid should be, so just ensure
      // it's there, and validate the rest
      actual.udid.should.exist;
      delete actual.udid;
      // if we are getting metrics for this run (such as on Travis) there will
      // be events in the result, but we cannot know what they should be
      delete actual.events;
      // sdk version can be a longer version
      actual.sdkVersion.indexOf(UICATALOG_CAPS.platformVersion).should.eql(0);
      delete actual.sdkVersion;
      // there might have been added wdaLocalPort and webDriverAgentUrl
      delete actual.wdaLocalPort;
      delete actual.webDriverAgentUrl;
      // now test for the visual and dimension data
      actual.statBarHeight.should.be.a('number');
      delete actual.statBarHeight;
      actual.pixelRatio.should.be.a('number');
      delete actual.pixelRatio;
      actual.viewportRect.should.exist;
      actual.viewportRect.height.should.be.a('number');
      actual.viewportRect.width.should.be.a('number');
      delete actual.viewportRect;

      delete expected.udid; // for real device tests

      if (expected.showXcodeLog === undefined) {
        delete expected.showXcodeLog;
      }

      if (process.env.CLOUD) {
        delete expected.app;
        delete expected[process.env.APPIUM_BUNDLE_CAP];

        delete expected.name;
        delete expected.build;

        // Cloud has several extraneous keys. Check if the caps contain expected subset only.
        actual.should.containSubset(expected);
      } else {
        actual.should.eql(expected);
      }
    });
  });

  describe('source -', function () {
    function checkSource (src) {
      // should have full elements
      src.should.include('<AppiumAUT>');
      src.should.include('<XCUIElementTypeApplication');

      // should not have any XCTest errors
      src.should.not.include('AX error');
    }
    describe('plain -', function () {
      it('should get the source for the page', async function () {
        let src = await driver.source();
        (typeof src).should.eql('string');
        checkSource(src);
      });
    });
    describe('json parsed -', function () {
      it('should get source with useJSONSource', async function () {
        await driver.updateSettings({useJSONSource: true});
        let src = await driver.source();
        checkSource(src);
      });
    });
  });

  describe('deactivate app -', function () {
    it('should background the app for the specified time', async function () {
      let before = Date.now();
      await driver.backgroundApp(4);
      (Date.now() - before).should.be.above(4000);
      (await driver.source()).indexOf('<AppiumAUT>').should.not.eql(-1);
    });
  });

  describe('screenshot -', function () {
    after(async function () {
      try {
        await driver.setOrientation('PORTRAIT');
      } catch (ign) {}
    });
    it('should get an app screenshot', async function () {
      let screenshot = await driver.takeScreenshot();
      screenshot.should.exist;
      screenshot.should.be.a('string');

      // make sure WDA didn't crash, by using it again
      let els = await driver.elementsByAccessibilityId('Alert Views');
      els.length.should.eql(1);
    });

    it('should get an app screenshot in landscape mode', async function () {
      let screenshot1 = (await driver.takeScreenshot());
      screenshot1.should.exist;

      try {
        await driver.setOrientation('LANDSCAPE');
      } catch (ign) {}
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
      const {statBarHeight, pixelRatio, viewportRect} = await driver.sessionCapabilities();
      const fullScreen = await driver.takeScreenshot();
      const viewScreen = await driver.execute('mobile: viewportScreenshot');
      const fullB64 = Buffer.from(fullScreen, 'base64');
      const viewB64 = Buffer.from(viewScreen, 'base64');
      const fullImg = new PNG({filterType: 4});
      await B.promisify(fullImg.parse, {context: fullImg})(fullB64);
      const viewImg = new PNG({filterType: 4});
      await B.promisify(viewImg.parse, {context: viewImg})(viewB64);
      fullImg.height.should.eql(viewImg.height + Math.round(pixelRatio * statBarHeight));
      viewImg.height.should.eql(viewportRect.height);
      fullImg.width.should.eql(viewImg.width);
    });
  });

  describe('logging -', function () {
    describe('types -', function () {
      it('should get the list of available logs', async function () {
        const expectedTypes = [
          'syslog', 'crashlog', 'performance', 'server', 'safariConsole',
        ];
        const actualTypes = await driver.logTypes();
        actualTypes.should.containSubset(expectedTypes);
      });
    });

    describe('retrieval -', function () {
      it('should throw an error when an invalid type is given', async function () {
        await driver.log('something-random').should.eventually.be.rejected;
      });
      it('should get system logs', async function () {
        (await driver.log('syslog')).should.be.an('array');
      });
      it('should get crash logs', async function () {
        (await driver.log('crashlog')).should.be.an('array');
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

      let el = await driver.elementByAccessibilityId('Buttons');
      await el.click();

      await driver.elementByAccessibilityId('Button').should.not.be.rejected;

      await driver.back();
    });
  });

  describe('window size -', function () {
    it('should be able to get the current window size', async function () {
      let size = await driver.getWindowSize('current');
      size.width.should.be.a('number');
      size.height.should.be.a('number');
    });
    it('should not be able to get random window size', async function () {
      await driver.getWindowSize('something-random')
        .should.eventually.be.rejectedWith(/Currently only getting current window size is supported/);
    });
  });

  describe('geo location -', function () {
    it('should work on Simulator', async function () {
      if (process.env.CI || process.env.REAL_DEVICE) {
        // skip on Travis, since Appium process should have access to system accessibility
        // in order to run this method successfully
        return this.skip();
      }
      await driver.setGeoLocation('30.0001', '21.0002').should.not.be.rejected;
    });
  });

  describe('shake -', function () {
    it('should work on Simulator', async function () {
      if (process.env.CI || process.env.REAL_DEVICE) {
        // skip on Travis, since Appium process should have access to system accessibility
        // in order to run this method successfully
        return this.skip();
      }
      await driver.shakeDevice().should.not.be.rejected;
    });
  });

  describe('lock -', function () {
    it('should properly lock and unlock the device', async function () {
      if (process.env.REAL_DEVICE) {
        return this.skip();
      }
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
      await driver.elementByAccessibilityId('Web View').click();
    });
    after(async function () {
      await driver.back();
      await driver.execute('mobile: scroll', {direction: 'up'});
    });

    it('should start a session, navigate to url, get title', async function () {
      // on some systems (like Travis) it takes a while to load the webview
      const contexts = await driver.contexts();

      await driver.context(contexts[1]);
      await driver.get(GUINEA_PIG_PAGE);

      await retryInterval(100, 1000, async function () {
        let title = await driver.title();
        title.should.equal('I am a page title');
      });

      await driver.context(contexts[0]);
    });
  });
});
