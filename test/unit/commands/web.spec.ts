import assert from 'node:assert/strict';
import {describe, it, afterEach} from 'node:test';
import {performance} from 'node:perf_hooks';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('web commands', function () {
  const driver = new XCUITestDriver({} as any);
  const atomSpy = sinon.stub(driver, 'executeAtom');
  afterEach(function () {
    atomSpy.reset();
    driver.implicitWaitMs = 0;
  });

  describe('findWebElementOrElements', function () {
    it('should honor implicit wait when find_elements atom keeps returning an empty array', async function () {
      driver.implicitWaitMs = 700;
      atomSpy.resolves([]);

      const els = await driver.findWebElementOrElements('id', 'foo', true);

      assert.deepStrictEqual(els, []);
      assert.ok(
        atomSpy.callCount > 1,
        `expected executeAtom to be retried while waiting, but it was only called ${atomSpy.callCount} time(s)`,
      );
    });

    it('should honor implicit wait when find_element_fragment atom keeps returning null', async function () {
      driver.implicitWaitMs = 700;
      atomSpy.resolves(null);

      await assert.rejects(driver.findWebElementOrElements('id', 'foo', false), /NoSuchElementError/);

      assert.ok(
        atomSpy.callCount > 1,
        `expected executeAtom to be retried while waiting, but it was only called ${atomSpy.callCount} time(s)`,
      );
    });

    it('should return immediately once an element is found', async function () {
      driver.implicitWaitMs = 5000;
      atomSpy.resolves({ELEMENT: 'elId'});

      const started = performance.now();
      await driver.findWebElementOrElements('id', 'foo', false);
      const elapsed = performance.now() - started;

      assert.strictEqual(atomSpy.callCount, 1);
      assert.ok(elapsed < 500, `expected the lookup to resolve quickly, but it took ${elapsed}ms`);
    });
  });
});
