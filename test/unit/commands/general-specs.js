import sinon from 'sinon';
import _ from 'lodash';
import {XCUITestDriver} from '../../../lib/driver';


describe('general commands', function () {
  const driver = new XCUITestDriver();

  let chai;
  let mockDriver;

  before(async function () {
    chai = await import('chai');
    chai.should();
  });

  beforeEach(function () {
    mockDriver = sinon.mock(driver);
  });

  afterEach(function () {
    mockDriver.verify();
  });

  describe('background', function () {
    it('should deactivate app for the given time if seconds is zero or greater', async function () {
      mockDriver.expects('proxyCommand').once().withExactArgs('/wda/deactivateApp', 'POST', { duration: 0.5 }, true);
      await driver.background(0.5);
    });

    it('should switch to home screen if seconds less than zero', async function () {
      mockDriver.expects('proxyCommand').once().withExactArgs('/wda/homescreen', 'POST', {}, false);
      await driver.background(-1);
    });

    it('should switch to home screen if seconds is null', async function () {
      mockDriver.expects('proxyCommand').once().withExactArgs('/wda/homescreen', 'POST', {}, false);
      await driver.background();
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
      driver._device = device;
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should send default request to Simulator', async function () {
      await driver.touchId();
      device.sendBiometricMatch.calledOnceWith(true, 'touchId').should.be.true;
    });

    it('should send request to Simulator with false', async function () {
      await driver.touchId(false);
      device.sendBiometricMatch.calledOnceWith(false, 'touchId').should.be.true;
    });

    it('should not be called on a real device', async function () {
      delete device.simctl;
      device.devicectl = true;
      await driver.touchId().should.be.rejected;

      device.sendBiometricMatch.called.should.be.false;
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
      driver._device = device;
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should be called on a Simulator', async function () {
      // @ts-expect-error random stuff on opts again
      driver.opts.allowTouchIdEnroll = true;
      await driver.toggleEnrollTouchId();
      device.enrollBiometric.calledOnce.should.be.true;
    });

    it('should not be called on a real device', async function () {
      delete device.simctl;
      device.devicectl = true;
      // @ts-expect-error random stuff on opts again
      driver.opts.allowTouchIdEnroll = true;
      await driver.toggleEnrollTouchId().should.be.rejected;
      device.enrollBiometric.called.should.be.false;
    });
  });

  describe('window size', function () {
    it('should be able to get the current window size with Rect', async function () {
      mockDriver.expects('proxyCommand').once().withExactArgs('/window/size', 'GET').returns({width: 100, height: 20});
      await driver.getWindowRect();
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
    before(function () {
      mockDriver.expects('proxyCommand').withExactArgs('/wda/screen', 'GET').returns({
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
