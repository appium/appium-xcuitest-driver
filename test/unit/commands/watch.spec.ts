import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('watch commands', function () {
  const driver = new XCUITestDriver({} as any);

  let mockDriver: sinon.SinonMock;

  beforeEach(function () {
    mockDriver = sinon.mock(driver);
    driver.opts.platformName = 'watchOS';
  });

  afterEach(function () {
    mockDriver.verify();
  });

  describe('mobileRotateDigitalCrown', function () {
    it('should proxy delta and velocity to WDA', async function () {
      mockDriver
        .expects('proxyCommand')
        .once()
        .withExactArgs('/wda/rotateDigitalCrown', 'POST', {delta: 0.2, velocity: 1.0});
      await driver.mobileRotateDigitalCrown(0.2, 1.0);
    });

    it('should proxy without velocity if it is not provided', async function () {
      mockDriver
        .expects('proxyCommand')
        .once()
        .withExactArgs('/wda/rotateDigitalCrown', 'POST', {delta: -0.5, velocity: undefined});
      await driver.mobileRotateDigitalCrown(-0.5);
    });

    it('should throw if platform is not watchOS', async function () {
      driver.opts.platformName = 'iOS';
      await assert.rejects(driver.mobileRotateDigitalCrown(0.2));
    });
  });

  describe('mobilePerformHandGesture', function () {
    it('should proxy the gesture name to WDA', async function () {
      mockDriver.expects('proxyCommand').once().withExactArgs('/wda/performHandGesture', 'POST', {name: 'doubleTap'});
      await driver.mobilePerformHandGesture('doubleTap' as any);
    });

    it('should throw if platform is not watchOS', async function () {
      driver.opts.platformName = 'iOS';
      await assert.rejects(driver.mobilePerformHandGesture('doubleTap' as any));
    });
  });
});
