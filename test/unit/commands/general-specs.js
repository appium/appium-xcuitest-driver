import sinon from 'sinon';
import XCUITestDriver from '../../..';


describe('general commands', function () {
  const driver = new XCUITestDriver();
  const proxyStub = sinon.stub(driver, 'proxyCommand');

  afterEach(function () {
    proxyStub.reset();
  });

  describe('background', function () {
    it('should send translated POST request to WDA', async function () {
      await driver.background();
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/wda/deactivateApp');
      proxyStub.firstCall.args[1].should.eql('POST');
    });
  });

  describe('touch id', function () {
    let deviceStub;

    beforeEach(async function () {
      deviceStub = sinon.mock(driver.opts, 'device');
    });

    afterEach(async function () {
      deviceStub.restore();
    });

    it('should send translated POST request to WDA', async function () {
      await driver.touchId();
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/wda/touch_id');
      proxyStub.firstCall.args[1].should.eql('POST');
      proxyStub.firstCall.args[2].should.eql({match: true});
    });

    it('should send translated POST request to WDA with true', async function () {
      await driver.touchId(true);
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/wda/touch_id');
      proxyStub.firstCall.args[1].should.eql('POST');
      proxyStub.firstCall.args[2].should.eql({match: true});
    });

    it('should send translated POST request to WDA with false', async function () {
      await driver.touchId(false);
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/wda/touch_id');
      proxyStub.firstCall.args[1].should.eql('POST');
      proxyStub.firstCall.args[2].should.eql({match: false});
    });

    it('should not be called on a real device', async function () {
      deviceStub.object.realDevice = true;
      await driver.touchId().should.eventually.be.rejectedWith(/not supported/g);
      proxyStub.notCalled.should.be.true;
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
      await driver.toggleEnrollTouchId().should.eventually.be.rejectedWith(/not supported/g);
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
    const baseCaps = {platformName: 'iOS', deviceName: 'bar', app: '/fake'};

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
      await driver.createSession(Object.assign({nativeWebTap: true}, baseCaps));
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
