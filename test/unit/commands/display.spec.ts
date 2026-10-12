import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('display commands', function () {
  const driver = new XCUITestDriver({} as any);

  let mockDriver: sinon.SinonMock;

  beforeEach(function () {
    mockDriver = sinon.mock(driver);
  });

  afterEach(function () {
    mockDriver.verify();
  });

  describe('listDisplays', function () {
    it('should return the displays reported by WDA in the UiAutomator2 format', async function () {
      const screens = [
        {displayId: 1, isMain: true, scale: 3, bounds: {x: 0, y: 0, width: 1206, height: 2622}, traits: 0},
        {displayId: 3, isMain: false, scale: 2, bounds: {x: 12, y: 34, width: 2007, height: 2853}, traits: 4},
      ];
      mockDriver.expects('proxyCommand').once().withExactArgs('/wda/screens', 'GET').resolves(screens);
      assert.deepEqual(await driver.execute('mobile: listDisplays'), [
        {
          id: 1,
          metrics: {
            widthPixels: 1206,
            heightPixels: 2622,
            xStart: 0,
            yStart: 0,
            density: 3,
            traits: 0,
          },
          isDefault: true,
        },
        {
          id: 3,
          metrics: {
            widthPixels: 2007,
            heightPixels: 2853,
            xStart: 12,
            yStart: 34,
            density: 2,
            traits: 4,
          },
          isDefault: false,
        },
      ]);
    });

    it('should target the main display by default', async function () {
      assert.strictEqual((await driver.getSettings()).currentDisplayId, null);
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
