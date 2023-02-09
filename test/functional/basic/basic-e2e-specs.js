import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiSubset from 'chai-subset';
import B from 'bluebird';
import util from 'util';
import { retryInterval } from 'asyncbox';
import { extractCapabilityValue, amendCapabilities, UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, hasDefaultPrebuiltWDA, MOCHA_TIMEOUT } from '../helpers/session';
import { GUINEA_PIG_PAGE } from '../web/helpers';
import { PNG } from 'pngjs';


chai.should();
chai.use(chaiAsPromised);
chai.use(chaiSubset);

describe('XCUITestDriver - basics -', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async function () {
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
      await driver.setImplicitTimeout(10000);
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

  describe('session -', function () {
    it('should get session details with our caps merged with WDA response', async function () {
      let actual = await driver.getSession(); // TODO: use a w3c compatible API
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
      actual.sdkVersion.indexOf(extractCapabilityValue(UICATALOG_CAPS, 'appium:platformVersion')).should.eql(0);
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
      delete actual.usePrebuiltWDA;

      // convert w3c caps into mjswp caps
      let mjswpCaps = {};
      Object.keys(UICATALOG_CAPS.alwaysMatch).forEach((key) => {
        const mjswpCapsKey = key.startsWith('appium:') ? key.replace('appium:', '') : key;
        mjswpCaps[mjswpCapsKey] = UICATALOG_CAPS.alwaysMatch[key];
      });
      const extraWdaCaps = {
        CFBundleIdentifier: 'com.example.apple-samplecode.UICatalog',
        device: 'iphone',
      };
      let expected = Object.assign({}, mjswpCaps, extraWdaCaps);
      delete expected.udid; // for real device tests
      delete expected.usePrebuiltWDA;

      if (expected.showXcodeLog === undefined) {
        delete expected.showXcodeLog;
      }

      actual.should.eql(expected);
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
      } catch (ign) {}
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
      const {statBarHeight, pixelRatio, viewportRect} = await driver.getSession(); // TODO: use a w3c compatible API
      const fullScreen = await driver.takeScreenshot();
      const viewScreen = await driver.execute('mobile: viewportScreenshot');
      const fullB64 = Buffer.from(fullScreen, 'base64');
      const viewB64 = Buffer.from(viewScreen, 'base64');
      const fullImg = new PNG({filterType: 4});
      await B.promisify(fullImg.parse, {context: fullImg})(fullB64);
      const viewImg = new PNG({filterType: 4});
      await B.promisify(viewImg.parse, {context: viewImg})(viewB64);
      // Viewport size can be smaller than the full image size + status bar on some devices.
      fullImg.height.should.be.gte(viewImg.height + Math.round(pixelRatio * statBarHeight));
      viewImg.height.should.eql(viewportRect.height);
      fullImg.width.should.be.gte(viewImg.width);
    });
  });

  describe('logging -', function () {
    describe('types -', function () {
      it('should get the list of available logs', async function () {
        const expectedTypes = [
          'syslog', 'crashlog', 'performance', 'server', 'safariConsole',
        ];
        const actualTypes = await driver.getLogTypes();
        actualTypes.should.containSubset(expectedTypes);
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
      let size = await driver.getWindowSize();
      size.width.should.be.a('number');
      size.height.should.be.a('number');
    });
  });

  describe('get geo location -', function () {
    it('should fail because of preference error', async function () {
      await driver.getGeoLocation()
        .should.be.rejectedWith('Location service must be');
    });
  });

  describe('geo location -', function () {
    it('should work on Simulator', async function () {
      if (process.env.CI) {
        // skip on Travis, since Appium process should have access to system accessibility
        // in order to run this method successfully
        return this.skip();
      }
      await driver.setGeoLocation({latitude: '30.0001', longitude: '21.0002'}).should.not.be.rejected;
    });
  });

  describe('shake -', function () {
    it('should work on Simulator', async function () {
      if (process.env.CI) {
        // skip on Travis, since Appium process should have access to system accessibility
        // in order to run this method successfully
        return this.skip();
      }
      await driver.shake().should.not.be.rejected;
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
      // on some systems (like Travis) it takes a while to load the webview
      const contexts = await driver.getContexts();

      await driver.switchContext(contexts[1]);
      await driver.navigateTo(GUINEA_PIG_PAGE);

      await retryInterval(100, 1000, async function () {
        let title = await driver.getTitle();
        title.should.equal('I am a page title');
      });

      await driver.switchContext(contexts[0]);
    });
  });
});
