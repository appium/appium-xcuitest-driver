import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';
import {mergeDeep} from '../../../lib/utils/index.js';

describe('general commands', function () {
  const driver = new XCUITestDriver({} as any);

  let mockDriver: sinon.SinonMock;

  beforeEach(function () {
    mockDriver = sinon.mock(driver);
  });

  afterEach(function () {
    mockDriver.verify();
  });

  describe('background', function () {
    it('should deactivate app for the given time if seconds is zero or greater', async function () {
      mockDriver.expects('proxyCommand').once().withExactArgs('/wda/deactivateApp', 'POST', {duration: 0.5}, true);
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
    let sandbox: sinon.SinonSandbox;

    let device: {sendBiometricMatch: sinon.SinonStub; devicectl?: any};
    let isSimulatorStub: sinon.SinonStub;

    beforeEach(function () {
      sandbox = sinon.createSandbox();
      device = {
        sendBiometricMatch: sandbox.stub(),
      };
      driver._device = device as any;
      isSimulatorStub = sandbox.stub(driver, 'isSimulator').returns(true);
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should send default request to Simulator', async function () {
      await driver.touchId();
      assert.strictEqual(device.sendBiometricMatch.calledOnceWithExactly(true, 'touchId'), true);
    });

    it('should send request to Simulator with false', async function () {
      await driver.touchId(false);
      assert.strictEqual(device.sendBiometricMatch.calledOnceWithExactly(false, 'touchId'), true);
    });

    it('should not be called on a real device', async function () {
      isSimulatorStub.returns(false);
      device.devicectl = true;
      await assert.rejects(driver.touchId());

      assert.strictEqual(device.sendBiometricMatch.called, false);
    });
  });

  describe('toggleEnrollTouchID', function () {
    let sandbox: sinon.SinonSandbox;
    let device: {enrollBiometric: sinon.SinonStub; devicectl?: any};
    let isSimulatorStub: sinon.SinonStub;

    beforeEach(function () {
      sandbox = sinon.createSandbox();
      device = {
        enrollBiometric: sandbox.stub(),
      };
      driver._device = device as any;
      isSimulatorStub = sandbox.stub(driver, 'isSimulator').returns(true);
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should be called on a Simulator', async function () {
      (driver.opts as Record<string, any>).allowTouchIdEnroll = true;
      await driver.toggleEnrollTouchId();
      assert.strictEqual(device.enrollBiometric.calledOnce, true);
    });

    it('should not be called on a real device', async function () {
      isSimulatorStub.returns(false);
      device.devicectl = true;
      (driver.opts as Record<string, any>).allowTouchIdEnroll = true;
      await assert.rejects(driver.toggleEnrollTouchId());
      assert.strictEqual(device.enrollBiometric.called, false);
    });
  });

  describe('nativeWebTap as a setting', function () {
    // create new driver with no opts
    let driver: XCUITestDriver;
    let startStub: sinon.SinonStub;

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
      startStub = sinon.stub(driver as any, 'start');
    });

    afterEach(function () {
      startStub.restore();
      driver = null as any;
    });

    it('should start out with setting defaulting to false', async function () {
      assert.strictEqual((await driver.getSettings()).nativeWebTap, false);
    });

    it('should default to value sent in caps after session starts', async function () {
      assert.strictEqual((await driver.getSettings()).nativeWebTap, false);
      await driver.createSession(
        mergeDeep({}, structuredClone(baseCaps), {
          alwaysMatch: {
            'appium:nativeWebTap': true,
          },
        }) as any,
      );
      assert.strictEqual((await driver.getSettings()).nativeWebTap, true);
    });

    it('should update opts value based on settings update', async function () {
      assert.strictEqual((await driver.getSettings()).nativeWebTap, false);
      await driver.updateSettings({nativeWebTap: true});
      assert.strictEqual((await driver.getSettings()).nativeWebTap, true);
      assert.strictEqual(driver.opts.nativeWebTap, true);
      await driver.updateSettings({nativeWebTap: false});
      assert.strictEqual((await driver.getSettings()).nativeWebTap, false);
      assert.strictEqual(driver.opts.nativeWebTap, false);
    });
  });

  describe('getDevicePixelRatio and getStatusBarHeight', function () {
    beforeEach(function () {
      mockDriver
        .expects('proxyCommand')
        .withExactArgs('/wda/screen', 'GET')
        .returns({
          statusBarSize: {
            width: 100,
            height: 20,
          },
          scale: 3,
        });
    });

    it('should get the pixel ratio from WDA', async function () {
      assert.strictEqual(await driver.getDevicePixelRatio(), 3);
    });

    it('should return the height of the status bar', async function () {
      assert.strictEqual(await driver.getStatusBarHeight(), 20);
    });
  });
  describe('screen geometry changes', function () {
    it('should refresh all geometry accessors when switching displays and returning', async function () {
      const driver = new XCUITestDriver({} as any);
      const screen = sinon.stub(driver, 'proxyCommand');
      for (const info of [
        {scale: 3, statusBarSize: {width: 466, height: 20}},
        {scale: 2, statusBarSize: {width: 951, height: 0}},
        {scale: 3, statusBarSize: {width: 466, height: 24}},
      ]) {
        screen.withArgs('/wda/screen', 'GET').resolves(info);
        assert.deepEqual(await driver.getScreenInfo(), info);
        assert.equal(await driver.getDevicePixelRatio(), info.scale);
        assert.equal(await driver.getStatusBarHeight(), info.statusBarSize.height);
      }
    });

    it('should retry screen info after a transient error', async function () {
      const driver = new XCUITestDriver({} as any);
      const screen = sinon.stub(driver, 'proxyCommand');
      screen.onFirstCall().rejects(new Error('Display unavailable'));
      screen.onSecondCall().resolves({scale: 2, statusBarSize: {width: 951, height: 20}});
      await assert.rejects(driver.getScreenInfo(), /Display unavailable/);
      assert.equal(await driver.getDevicePixelRatio(), 2);
    });

    it('should use the display dimensions even when the app window is smaller', async function () {
      const driver = new XCUITestDriver({} as any);
      sinon.stub(driver, 'proxyCommand').resolves({
        scale: 3,
        statusBarSize: {width: 951, height: 20},
        screenSize: {width: 951, height: 669},
      });
      const window = sinon.stub(driver, 'getWindowRect').resolves({x: 0, y: 0, width: 400, height: 600});
      assert.deepEqual(await driver.getViewportRect(), {left: 0, top: 60, width: 2853, height: 1947});
      sinon.assert.notCalled(window);
    });

    it('should use one screen snapshot per viewport calculation', async function () {
      const driver = new XCUITestDriver({} as any);
      const screen = sinon.stub(driver, 'proxyCommand');
      screen
        .withArgs('/wda/screen', 'GET')
        .onFirstCall()
        .resolves({
          scale: 2,
          statusBarSize: {width: 951, height: 20.5},
        });
      screen
        .withArgs('/wda/screen', 'GET')
        .onSecondCall()
        .resolves({
          scale: 3,
          statusBarSize: {width: 466, height: 30},
        });
      sinon.stub(driver, 'getWindowRect').resolves({x: 0, y: 0, width: 951, height: 669});
      assert.deepEqual(await driver.getViewportRect(), {left: 0, top: 41, width: 1902, height: 1297});
      sinon.assert.calledOnce(screen);
    });
  });
});
