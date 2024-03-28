import sinon from 'sinon';
import _ from 'lodash';
import XCUITestDriver from '../../../lib/driver';
import chai from 'chai';
import sinonChai from 'sinon-chai';

chai.use(sinonChai);

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
      await driver.background();
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/wda/homescreen');
      proxyStub.firstCall.args[1].should.eql('POST');
    });
  });

  describe('touch id', function () {
    /** @type {import('sinon').SinonSandbox} */
    let sandbox;

    /** @type { {sendBiometricMatch: import('sinon').SinonStub, simctl?: any, devicectl?: any} } */
    let device;

    beforeEach(function () {
      sandbox = sinon.createSandbox();
      device = {
        simctl: true,
        sendBiometricMatch: sandbox.stub(),
      };
      // @ts-ignore
      driver._device = device;
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should send default request to Simulator', async function () {
      await driver.touchId();
      device.sendBiometricMatch.should.have.been.calledOnceWith(true, 'touchId');
    });

    it('should send request to Simulator with false', async function () {
      await driver.touchId(false);
      device.sendBiometricMatch.should.have.been.calledOnceWith(false, 'touchId');
    });

    it('should not be called on a real device', async function () {
      delete device.simctl;
      device.devicectl = true;
      await driver.touchId().should.be.rejected;
      device.sendBiometricMatch.should.not.have.been.called;
      // sendBiometricMatchSpy.notCalled.should.be.true;
    });
  });

  describe('toggleEnrollTouchID', function () {
    /** @type {import('sinon').SinonSandbox} */
    let sandbox;

    /** @type { {enrollBiometric: import('sinon').SinonStub, simctl?: any, devicectl?: any} } */
    let device;

    beforeEach(function () {
      sandbox = sinon.createSandbox();
      device = {
        simctl: true,
        enrollBiometric: sandbox.stub(),
      };
      // @ts-ignore
      driver._device = device;
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should be called on a Simulator', async function () {
      // @ts-expect-error random stuff on opts again
      driver.opts.allowTouchIdEnroll = true;
      await driver.toggleEnrollTouchId();
      device.enrollBiometric.should.have.been.calledOnce;
    });

    it('should not be called on a real device', async function () {
      delete device.simctl;
      device.devicectl = true;
      // @ts-expect-error random stuff on opts again
      driver.opts.allowTouchIdEnroll = true;
      await driver.toggleEnrollTouchId().should.be.rejected;
      device.enrollBiometric.should.not.have.been.called;
    });
  });

  describe('window size', function () {
    it('should be able to get the current window size with Rect', async function () {
      proxyStub.withArgs('/window/size', 'GET').resolves({width: 100, height: 20});

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
        'appium:app': '/fake',
      },
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
      await driver.createSession(
        null,
        null,
        _.merge({}, baseCaps, {
          alwaysMatch: {
            'appium:nativeWebTap': true,
          },
        }),
      );
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
      proxyStub.withArgs('/wda/screen', 'GET').resolves({
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
