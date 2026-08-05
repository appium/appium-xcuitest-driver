import assert from 'node:assert/strict';
import {describe, it, beforeEach} from 'node:test';

import {runSimulatorReset} from '../../lib/device/simulator-management.js';
import {XCUITestDriver} from '../../lib/driver.js';

describe('simulator management', function () {
  describe('runSimulatorReset', function () {
    let result: {bundleId: string} | 'cleaned' | undefined;
    let driver: XCUITestDriver;
    const stoppedDeviceDummy = {
      isRunning: () => false,
      scrubApp: (bundleId: string) => {
        result = {bundleId};
      },
      clean: () => {
        result = 'cleaned';
      },
      shutdown: () => {},
    };

    beforeEach(function () {
      result = undefined;
      driver = new XCUITestDriver({} as any);
    });

    it('should call scrubApp with fastReset', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        noReset: false,
        fullReset: false,
      } as any;
      (driver as any)._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      assert.strictEqual((result as any).bundleId, 'io.appium.example');
    });
    it('should return immediately with noReset', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        noReset: true,
        fullReset: false,
      } as any;
      (driver as any)._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      assert.strictEqual(result, undefined);
    });
    it('should call clean with fullRest', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        noReset: false,
        fullReset: true,
      } as any;
      (driver as any)._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      assert.strictEqual(result, 'cleaned');
    });
    it('should not call scrubApp with fastReset and app', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        app: 'path/to/app.app',
        noReset: false,
        fullReset: false,
      } as any;
      (driver as any)._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      assert.strictEqual(result, undefined);
    });
    it('should return immediately with noReset and app', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        app: 'path/to/app.app',
        noReset: true,
        fullReset: false,
      } as any;
      (driver as any)._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      assert.strictEqual(result, undefined);
    });
    it('should call clean with fullRest and app', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        app: 'path/to/app.app',
        noReset: false,
        fullReset: true,
      } as any;
      (driver as any)._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      assert.strictEqual(result, 'cleaned');
    });
    it('should not call scrubApp with fastReset, but no bundleid and app', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        noReset: false,
        fullReset: false,
      } as any;
      (driver as any)._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      assert.strictEqual(result, undefined);
    });
  });
});
