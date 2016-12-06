import sinon from 'sinon';
import { settings as iosSettings } from 'appium-ios-driver';
import XCUITestDriver from '../..';
import xcode from 'appium-xcode';


describe('driver commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('status', () => {
    it('should send status request to WDA', async () => {
      await driver.getStatus();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/status');
      proxySpy.firstCall.args[1].should.eql('GET');
    });
  });

  describe('createSession', () => {
    let d, stubs = [];

    beforeEach(() => {
      d = new XCUITestDriver();
      let anoop = async () => {};
      stubs.push(sinon.stub(d, "determineDevice", async () => {
        return {device: null, udid: null, realDevice: null};
      }));
      stubs.push(sinon.stub(d, "configureApp", anoop));
      stubs.push(sinon.stub(d, "checkAppPresent", anoop));
      stubs.push(sinon.stub(d, "startLogCapture", anoop));
      stubs.push(sinon.stub(d, "startSim", anoop));
      stubs.push(sinon.stub(d, "startWdaSession", anoop));
      stubs.push(sinon.stub(d, "startWda", anoop));
      stubs.push(sinon.stub(d, "extractBundleId", anoop));
      stubs.push(sinon.stub(d, "installApp", anoop));
      stubs.push(sinon.stub(iosSettings, "setLocale", anoop));
      stubs.push(sinon.stub(iosSettings, "setPreferences", anoop));
      stubs.push(sinon.stub(xcode, "getMaxIOSSDK", async () => {
        return '10.0';
      }));
    });

    afterEach(() => {
      for (let s of stubs) {
        s.restore();
      }
    });

    it('should include server capabilities', async () => {
      let resCaps = await d.createSession({platformName: "iOS", deviceName: "iPhone 6", app: "/foo.app"});
      resCaps[1].javascriptEnabled.should.be.true;
    });
  });
});
