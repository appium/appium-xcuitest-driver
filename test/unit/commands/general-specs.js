import sinon from 'sinon';
import XCUITestDriver from '../../..';


describe('general commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('background', () => {
    it('should send translated POST request to WDA', async () => {
      await driver.background();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/wda/deactivateApp');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
  });

  describe('touch id', () => {
    let deviceStub;

    beforeEach(async () => {
      deviceStub = sinon.mock(driver.opts, 'device');
    });

    afterEach(async () => {
      deviceStub.restore();
    });

    it('should send translated POST request to WDA', async () => {
      await driver.touchId();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/wda/touch_id');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql({match: true});
    });

    it('should send translated POST request to WDA with true', async () => {
      await driver.touchId(true);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/wda/touch_id');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql({match: true});
    });

    it('should send translated POST request to WDA with false', async () => {
      await driver.touchId(false);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/wda/touch_id');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql({match: false});
    });

    it('should not be called on a real device', async () => {
      deviceStub.object.realDevice = true;
      await driver.touchId().should.eventually.be.rejectedWith(/not supported/g);
      proxySpy.notCalled.should.be.true;
    });
  });

  describe('toggleEnrollTouchID', () => {
    let deviceStub, enrollTouchIDSpy, optsStub;

    beforeEach(() => {
      optsStub = sinon.mock(driver.opts);
      deviceStub = sinon.mock(driver.opts, 'device');
      deviceStub.object.device = {
        enrollTouchID: () => {},
      };
      enrollTouchIDSpy = sinon.spy(driver.opts.device, 'enrollTouchID');
    });

    afterEach(() => {
      deviceStub.restore();
      optsStub.restore();
      enrollTouchIDSpy.restore();
    });

    it('should be called on a Simulator', async () => {
      deviceStub.object.realDevice = false;
      deviceStub.object.allowTouchIdEnroll = true;
      await driver.toggleEnrollTouchId();
      enrollTouchIDSpy.calledOnce.should.be.true;
    });

    it('should not be called on a real device', async () => {
      deviceStub.object.realDevice = true;
      deviceStub.object.allowTouchIdEnroll = true;
      await driver.toggleEnrollTouchId().should.eventually.be.rejectedWith(/not supported/g);
      enrollTouchIDSpy.notCalled.should.be.true;
    });
  });

  describe('nativeWebTap as a setting', () => {
    // create new driver with no opts
    let driver, startStub;
    const baseCaps = {platformName: 'iOS', deviceName: 'bar', app: '/fake'};

    beforeEach(() => {
      driver = new XCUITestDriver();
      startStub = sinon.stub(driver, 'start');
    });

    afterEach(() => {
      startStub.restore();
      driver = null;
    });

    it('should start out with setting defaulting to false', async () => {
      (await driver.getSettings()).nativeWebTap.should.eql(false);
    });

    it('should default to value sent in caps after session starts', async () => {
      (await driver.getSettings()).nativeWebTap.should.eql(false);
      await driver.createSession(Object.assign({nativeWebTap: true}, baseCaps));
      (await driver.getSettings()).nativeWebTap.should.eql(true);
    });

    it('should update opts value based on settings update', async () => {
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
    proxySpy
      .withArgs('/wda/screen', 'GET')
      .returns({
        statusBarSize: {width: 100, height: 20},
        scale: 3
      });

    it('should get the pixel ratio from WDA', async () => {
      await driver.getDevicePixelRatio().should.eventually.eql(3);
    });

    it('should return the height of the status bar', async () => {
      await driver.getStatusBarHeight().should.eventually.eql(20);
    });
  });
});
