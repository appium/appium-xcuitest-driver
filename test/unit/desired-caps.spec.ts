import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {XCUITestDriver} from '../../lib/driver.js';

describe('desired capabilities', function () {
  describe('autoLaunch', function () {
    // no longer a base capability in Appium 4 (appium/appium#22950)
    it('accepts a boolean', function () {
      const driver = new XCUITestDriver({} as any);
      assert.strictEqual(driver.validateDesiredCaps({platformName: 'iOS', autoLaunch: false}), true);
    });

    it('rejects a value that is not a boolean', function () {
      const driver = new XCUITestDriver({} as any);
      assert.throws(() => driver.validateDesiredCaps({platformName: 'iOS', autoLaunch: 'no'}), /autoLaunch/);
    });
  });
});
