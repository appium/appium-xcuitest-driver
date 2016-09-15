import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import { UICATALOG_CAPS, PLATFORM_VERSION } from '../desired';
import { initSession, deleteSession } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - basics', function () {
  this.timeout(200 * 1000);

  let driver;
  before(async () => {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(async () => {
    await deleteSession();
  });

  describe('status', () => {
    it('should get the server status', async () => {
      let status = await driver.status();
      status.wda.should.exist;
    });
  });

  describe('source', () => {
    it('should get the source for the page', async () => {
      let src = await driver.source();
      (typeof src).should.eql('string');
      src.indexOf('<AppiumAUT>').should.not.eql(-1);
    });
  });

  describe('deactivate app', () => {
    it('should background the app for the specified time', async () => {
      let before = Date.now();
      await driver.backgroundApp(4);
      (Date.now() - before).should.be.above(4000);
      (await driver.source()).indexOf('<AppiumAUT>').should.not.eql(-1);
    });
  });

  describe('screenshot', () => {
    after(async () => {
      try {
        await driver.setOrientation("PORTRAIT");
      } catch (ign) {}
    });
    it('should get an app screenshot', async () => {
      (await driver.takeScreenshot()).should.exist;
    });

    it('should get an app screenshot in landscape mode', async () => {
      let screenshot1 = (await driver.takeScreenshot());
      screenshot1.should.exist;

      try {
        await driver.setOrientation("LANDSCAPE");
      } catch (ign) {}
      // take a little pause while it orients, otherwise you get the screenshot
      // on an angle
      await B.delay(500);

      let screenshot2 = await driver.takeScreenshot();
      screenshot2.should.exist;
      screenshot2.should.not.eql(screenshot1);
    });
  });

  describe('logging', () => {
    describe('types', () => {
      it('should get the list of available logs', async () => {
        let expectedTypes = ['syslog', 'crashlog', 'performance'];
        (await driver.logTypes()).should.eql(expectedTypes);
      });
    });

    describe('retrieval', () => {
      it('should throw an error when an invalid type is given', async () => {
        await driver.log('something-random').should.eventually.be.rejected;
      });
      it('should get system logs', async () => {
        (await driver.log('syslog')).should.be.an.Array;
      });
      it('should get crash logs', async () => {
        (await driver.log('crashlog')).should.be.an.Array;
      });
    });
  });

  describe('orientation', () => {
    it('should get the current orientation', async () => {
      let orientation = await driver.getOrientation();
      ['PORTRAIT', 'LANDSCAPE'].should.include(orientation);
    });
    it('should set the orientation', async function () {
      // currently setting the orientation on iOS 10 does not work through WDA
      // so skip this test for now
      if (PLATFORM_VERSION === '10.0') this.skip();

      let orientation = await driver.getOrientation();

      let newOrientation = (orientation === 'PORTRAIT' ? 'LANDSCAPE' : 'PORTRAIT');
      await driver.setOrientation(newOrientation);

      (await driver.getOrientation()).should.eql(newOrientation);

      // return it to the state we started in
      await driver.setOrientation(orientation);
    });
  });

  describe('window size', () => {
    it('should be able to get the current window size', async () => {
      let size = await driver.getWindowSize('current');
      size.width.should.exist;
      size.height.should.exist;
    });
    it('should not be able to get random window size', async () => {
      await driver.getWindowSize('something-random').should.be.rejectedWith(/Currently only getting current window size is supported/);
    });
  });
});
