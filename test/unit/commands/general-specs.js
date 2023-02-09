import sinon from 'sinon';
import _ from 'lodash';
import XCUITestDriver from '../../../lib/driver';


describe('general commands', function () {
  const driver = new XCUITestDriver();
  const proxyStub = sinon.stub(driver, 'proxyCommand');

  afterEach(function () {
    proxyStub.reset();
  });

  describe('background', function () {
    it('should deactivate app for the given time if seconds is zero or greater', async function () {
      await driver.background(0.5);
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/wda/deactivateApp');
      proxyStub.firstCall.args[1].should.eql('POST');
    });

    it('should switch to home screen if seconds less than zero', async function () {
      await driver.background(-1);
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/wda/homescreen');
      proxyStub.firstCall.args[1].should.eql('POST');
    });

    it('should switch to home screen if seconds is null', async function () {
      await driver.background(null);
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/wda/homescreen');
      proxyStub.firstCall.args[1].should.eql('POST');
    });
  });

  describe('touch id', function () {
    let deviceStub;
    let sendBiometricMatchSpy;

    beforeEach(function () {
      deviceStub = sinon.mock(driver.opts, 'device');
      deviceStub.object.device = {
        sendBiometricMatch: () => {},
      };
      sendBiometricMatchSpy = sinon.spy(driver.opts.device, 'sendBiometricMatch');
      deviceStub.object.realDevice = false;
    });

    afterEach(function () {
      deviceStub.restore();
      sendBiometricMatchSpy.restore();
    });

    it('should send default request to Simulator', async function () {
      await driver.touchId();
      sendBiometricMatchSpy.calledOnce.should.be.true;
      sendBiometricMatchSpy.firstCall.args[0].should.eql(true);
      sendBiometricMatchSpy.firstCall.args[1].should.eql('touchId');
    });

    it('should send request to Simulator with false', async function () {
      await driver.touchId(false);
      sendBiometricMatchSpy.calledOnce.should.be.true;
      sendBiometricMatchSpy.firstCall.args[0].should.eql(false);
      sendBiometricMatchSpy.firstCall.args[1].should.eql('touchId');
    });

    it('should not be called on a real device', async function () {
      deviceStub.object.realDevice = true;
      await driver.touchId().should.be.rejected;
      sendBiometricMatchSpy.notCalled.should.be.true;
    });
  });

  describe('toggleEnrollTouchID', function () {
    let deviceStub, enrollBiometricSpy, optsStub;

    beforeEach(function () {
      optsStub = sinon.mock(driver.opts);
      deviceStub = sinon.mock(driver.opts, 'device');
      deviceStub.object.device = {
        enrollBiometric: () => {},
      };
      enrollBiometricSpy = sinon.spy(driver.opts.device, 'enrollBiometric');
    });

    afterEach(function () {
      deviceStub.restore();
      optsStub.restore();
      enrollBiometricSpy.restore();
    });

    it('should be called on a Simulator', async function () {
      deviceStub.object.realDevice = false;
      deviceStub.object.allowTouchIdEnroll = true;
      await driver.toggleEnrollTouchId();
      enrollBiometricSpy.calledOnce.should.be.true;
    });

    it('should not be called on a real device', async function () {
      deviceStub.object.realDevice = true;
      deviceStub.object.allowTouchIdEnroll = true;
      await driver.toggleEnrollTouchId().should.be.rejected;
      enrollBiometricSpy.notCalled.should.be.true;
    });
  });

  describe('window size', function () {
    it('should be able to get the current window size with Rect', async function () {
      proxyStub
        .withArgs('/window/size', 'GET')
        .returns({width: 100, height: 20});

      await driver.getWindowRect();
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/window/size');
      proxyStub.firstCall.args[1].should.eql('GET');
    });
  });

  describe('nativeWebTap as a setting', function () {
    // create new driver with no opts
    let driver, startStub;
    const baseCaps = {
      firstMatch: [{}],
      alwaysMatch: {
        platformName: 'iOS',
        'appium:deviceName': 'bar',
        'appium:app': '/fake'
      }
    };

    beforeEach(function () {
      driver = new XCUITestDriver();
      startStub = sinon.stub(driver, 'start');
    });

    afterEach(function () {
      startStub.restore();
      driver = null;
    });

    it('should start out with setting defaulting to false', async function () {
      (await driver.getSettings()).nativeWebTap.should.eql(false);
    });

    it('should default to value sent in caps after session starts', async function () {
      (await driver.getSettings()).nativeWebTap.should.eql(false);
      await driver.createSession(null, null, _.merge({}, baseCaps, {
        alwaysMatch: {
          'appium:nativeWebTap': true,
        }
      }));
      (await driver.getSettings()).nativeWebTap.should.eql(true);
    });

    it('should update opts value based on settings update', async function () {
      (await driver.getSettings()).nativeWebTap.should.eql(false);
      await driver.updateSettings({nativeWebTap: true});
      (await driver.getSettings()).nativeWebTap.should.eql(true);
      driver.opts.nativeWebTap.should.be.true;
      await driver.updateSettings({nativeWebTap: false});
      (await driver.getSettings()).nativeWebTap.should.eql(false);
      driver.opts.nativeWebTap.should.be.false;
    });
  });

  describe('getDevicePixelRatio and getStatusBarHeight', function () {
    beforeEach(function () {
      proxyStub
        .withArgs('/wda/screen', 'GET')
        .returns({
          statusBarSize: {
            width: 100,
            height: 20,
          },
          scale: 3,
        });
    });

    it('should get the pixel ratio from WDA', async function () {
      await driver.getDevicePixelRatio().should.eventually.eql(3);
    });

    it('should return the height of the status bar', async function () {
      await driver.getStatusBarHeight().should.eventually.eql(20);
    });
  });
});
