import assert from 'node:assert/strict';
import {describe, it, afterEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../lib/driver.js';
import {withoutImplicitWait} from '../../lib/utils/index.js';

describe('utils/implicit-wait', function () {
  describe('withoutImplicitWait', function () {
    const driver = new XCUITestDriver({} as any);

    afterEach(function () {
      driver.implicitWaitMs = 0;
    });

    it('should run the callback with no implicit wait and restore the original value', async function () {
      driver.implicitWaitMs = 700;
      let waitDuringCall: number | null = null;

      const result = await withoutImplicitWait(driver, async () => {
        waitDuringCall = driver.implicitWaitMs;
        return 'done';
      });

      assert.strictEqual(result, 'done');
      assert.strictEqual(waitDuringCall, 0);
      assert.strictEqual(driver.implicitWaitMs, 700);
    });

    it('should restore the original value when the callback throws', async function () {
      driver.implicitWaitMs = 700;

      await assert.rejects(
        withoutImplicitWait(driver, async () => {
          throw new Error('lookup failed');
        }),
        /lookup failed/,
      );

      assert.strictEqual(driver.implicitWaitMs, 700);
    });

    it('should not touch the implicit wait when it is already zero', async function () {
      driver.implicitWaitMs = 0;
      const setImplicitWait = sinon.spy(driver, 'setImplicitWait');
      try {
        assert.strictEqual(await withoutImplicitWait(driver, async () => 'done'), 'done');
        assert.strictEqual(setImplicitWait.callCount, 0);
      } finally {
        setImplicitWait.restore();
      }
    });
  });
});
