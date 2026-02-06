import sinon from 'sinon';
import _ from 'lodash';
import {XCUITestDriver} from '../../../lib/driver';
import {expect} from 'chai';


describe('general commands', function () {
  const driver = new XCUITestDriver({} as any);

  let mockDriver;

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
      expect(device.sendBiometricMatch.calledOnceWithExactly(true, 'touchId')).to.be.true;
    });

    it('should send request to Simulator with false', async function () {
      await driver.touchId(false);
      expect(device.sendBiometricMatch.calledOnceWithExactly(false, 'touchId')).to.be.true;
    });

    it('should not be called on a real device', async function () {
      delete device.simctl;
      device.devicectl = true;
      await expect(driver.touchId()).to.be.rejected;

      expect(device.sendBiometricMatch.called).to.be.false;
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
      (driver.opts as Record<string, any>).allowTouchIdEnroll = true;
      await driver.toggleEnrollTouchId();
      expect(device.enrollBiometric.calledOnce).to.be.true;
    });

    it('should not be called on a real device', async function () {
      delete device.simctl;
      device.devicectl = true;
      (driver.opts as Record<string, any>).allowTouchIdEnroll = true;
      await expect(driver.toggleEnrollTouchId()).to.be.rejected;
      expect(device.enrollBiometric.called).to.be.false;
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
      driver = new XCUITestDriver({} as any);
      startStub = sinon.stub(driver, 'start');
    });

    afterEach(function () {
      startStub.restore();
      driver = null;
    });

    it('should start out with setting defaulting to false', async function () {
      expect((await driver.getSettings()).nativeWebTap).to.eql(false);
    });

    it('should default to value sent in caps after session starts', async function () {
      expect((await driver.getSettings()).nativeWebTap).to.eql(false);
      await driver.createSession(
        null,
        null,
        _.merge({}, baseCaps, {
          alwaysMatch: {
            'appium:nativeWebTap': true,
          },
        }),
      );
      expect((await driver.getSettings()).nativeWebTap).to.eql(true);
    });

    it('should update opts value based on settings update', async function () {
      expect((await driver.getSettings()).nativeWebTap).to.eql(false);
      await driver.updateSettings({nativeWebTap: true});
      expect((await driver.getSettings()).nativeWebTap).to.eql(true);
      expect(driver.opts.nativeWebTap).to.be.true;
      await driver.updateSettings({nativeWebTap: false});
      expect((await driver.getSettings()).nativeWebTap).to.eql(false);
      expect(driver.opts.nativeWebTap).to.be.false;
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
      await expect(driver.getDevicePixelRatio()).to.eventually.eql(3);
    });

    it('should return the height of the status bar', async function () {
      await expect(driver.getStatusBarHeight()).to.eventually.eql(20);
    });
  });
});
