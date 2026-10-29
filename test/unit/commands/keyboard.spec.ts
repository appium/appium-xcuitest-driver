import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('keyboard commands', function () {
  let driver: XCUITestDriver;
  let sandbox: sinon.SinonSandbox;

  beforeEach(function () {
    driver = new XCUITestDriver({} as any);
    driver.sessionId = 'session-id';
    driver.implicitWaitMs = 700;
    sandbox = sinon.createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('isKeyboardShown', function () {
    it('should return false without waiting for the implicit timeout when the keyboard is hidden', async function () {
      const proxy = sandbox.stub(driver, 'proxyCommand').rejects(new Error('no such element'));

      assert.strictEqual(await driver.isKeyboardShown(), false);

      assert.strictEqual(proxy.callCount, 1, `expected a single lookup, got ${proxy.callCount}`);
      assert.strictEqual(driver.implicitWaitMs, 700);
    });

    it('should return true when the keyboard is shown', async function () {
      sandbox.stub(driver, 'proxyCommand').resolves({ELEMENT: 'keyboard'});

      assert.strictEqual(await driver.isKeyboardShown(), true);
      assert.strictEqual(driver.implicitWaitMs, 700);
    });
  });
});
