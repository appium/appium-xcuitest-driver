import B from 'bluebird';
import util from 'node:util';
import {retryInterval} from 'asyncbox';
import {isIosVersionBelow, getUICatalogCaps} from '../desired';
import {initSession, deleteSession, MOCHA_TIMEOUT} from '../helpers/session';
import {GUINEA_PIG_PAGE} from '../web/helpers';
import sharp from 'sharp';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('XCUITestDriver - basics -', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  before(async function () {
    const uiCatalogCaps = await getUICatalogCaps();
    driver = await initSession(uiCatalogCaps);
  });
  after(async function () {
    await deleteSession();
  });

  describe('status -', function () {
    it('should get the server status', async function () {
      const status = await driver.status();
      expect(status.build.version).to.exist;
    });

    it('should return status immediately if another operation is in progress', async function () {
      await driver.setTimeout({implicit: 10000});
      const findElementPromise = driver.$('#WrongLocator');
      const status = await driver.status();
      expect(status.build.version).to.exist;
      expect(util.inspect(findElementPromise).includes('pending')).to.be.true;
      try {
        await findElementPromise;
      } catch (err: any) {
        expect(err.status).to.eql(7);
      }
    });
  });

  describe('source -', function () {
    function checkSource(src: string) {
      // should have full elements
      expect(src).to.include('<AppiumAUT>');
      expect(src).to.include('<XCUIElementTypeApplication');

      // should not have any XCTest errors
      expect(src).to.not.include('AX error');
    }
    describe('plain -', function () {
      it('should get the source for the page', async function () {
        const src = await driver.getPageSource();
        expect(typeof src).to.eql('string');
        checkSource(src);
      });
    });
    describe('json parsed -', function () {
      it('should get source with useJSONSource', async function () {
        await driver.updateSettings({useJSONSource: true});
        const src = await driver.getPageSource();
        checkSource(src);
      });
    });
  });

  describe('deactivate app -', function () {
    it('should background the app for the specified time', async function () {
      const before = Date.now();
      await driver.background(4);
      expect(Date.now() - before).to.be.above(4000);
      expect((await driver.getPageSource()).indexOf('<AppiumAUT>')).to.not.eql(-1);
    });
  });

  describe('screenshot -', function () {
    after(async function () {
      try {
        await driver.setOrientation('PORTRAIT');
      } catch {}
    });
    it('should get an app screenshot', async function () {
      const screenshot = await driver.takeScreenshot();
      expect(screenshot).to.exist;
      expect(screenshot).to.be.a('string');

      // make sure WDA didn't crash, by using it again
      const els = await driver.$$('~Alert Views');
      expect(els.length).to.eql(1);
    });

    it('should get an app screenshot in landscape mode', async function () {
      const screenshot1 = await driver.takeScreenshot();
      expect(screenshot1).to.exist;

      try {
        await driver.setOrientation('LANDSCAPE');
      } catch {}
      // take a little pause while it orients, otherwise you get the screenshot
      // on an angle
      await B.delay(500);

      const screenshot2 = await driver.takeScreenshot();
      expect(screenshot2).to.exist;
      expect(screenshot2).to.not.eql(screenshot1);
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
      expect(fullImgHeight).to.be.gte(viewImgHeight! + Math.round(scale * statusBarSize.height));
      expect(viewImgHeight).to.eql(viewportRect.height);
      expect(fullImgWidth).to.be.gte(viewImgWidth!);
    });
  });

  describe('logging -', function () {
    describe('types -', function () {
      it('should get the list of available logs', async function () {
        const actualTypes = await driver.getLogTypes();
        for (const expectedType of [
          'syslog',
          'crashlog',
          'performance',
          'safariConsole',
          'safariNetwork',
          'server',
        ]) {
          expect(actualTypes).to.include(expectedType);
        }
      });
    });

    describe('retrieval -', function () {
      it('should throw an error when an invalid type is given', async function () {
        await expect(driver.getLogs('something-random')).to.be.rejected;
      });
      it('should get system logs', async function () {
        expect(await driver.getLogs('syslog')).to.be.an('array');
      });
      it('should get crash logs', async function () {
        expect(await driver.getLogs('crashlog')).to.be.an('array');
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
      const orientation = await driver.getOrientation();
      expect(['PORTRAIT', 'LANDSCAPE']).to.include(orientation);
    });
    it('should set the orientation', async function () {
      await driver.setOrientation('LANDSCAPE');

      expect(await driver.getOrientation()).to.eql('LANDSCAPE');
    });
    it('should be able to interact with an element in LANDSCAPE', async function () {
      await driver.setOrientation('LANDSCAPE');

      const el = await driver.$('#Buttons');
      await el.click();

      await expect(driver.findElement('css selector', '#Button')).to.not.be.rejected;

      await driver.back();
    });
  });

  describe('window size -', function () {
    it('should be able to get the current window size', async function () {
      const size = await driver.getWindowRect();
      expect(size.width).to.be.a('number');
      expect(size.height).to.be.a('number');
    });
  });

  describe('geo location -', function () {
    it('should work on Simulator', async function () {
      await expect(driver.execute('mobile: getSimulatedLocation')).to.be.fulfilled;
      await expect(
        driver.execute('mobile: setSimulatedLocation', {latitude: '30.0001', longitude: '21.0002'}),
      ).to.not.be.rejected;
    });
  });

  describe('shake -', function () {
    it('should work on Simulator', async function () {
      await expect(driver.execute('mobile: shake')).to.be.fulfilled;
    });
  });

  describe('lock -', function () {
    it('should properly lock and unlock the device', async function () {
      try {
        await driver.lock();
        expect(await driver.isLocked()).to.be.true;
      } finally {
        await driver.unlock();
      }
      expect(await driver.isLocked()).to.be.false;
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
        const title = await driver.getTitle();
        expect(title).to.equal('I am a page title');
      });

      await driver.switchContext(contexts[0].id);
    });
  });
});
