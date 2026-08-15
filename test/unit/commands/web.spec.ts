import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {describe, it, afterEach} from 'node:test';

import sinon from 'sinon';

import {fitAffineTransform, viewportSignature} from '../../../lib/commands/web-native-bridge.js';
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

  describe('fitAffineTransform', function () {
    it('should reproduce the 2-point calibration transform', function () {
      // native = 93 + 7*(-1)=93, 107 for the two calibration taps; web-observed clicks at 100/98 and 114/102
      const {offsetX, offsetY, pixelRatioX, pixelRatioY} = fitAffineTransform([
        {native: {x: 93, y: 93}, web: {x: 100, y: 98}},
        {native: {x: 107, y: 107}, web: {x: 114, y: 102}},
      ]);

      assert.strictEqual(pixelRatioX, 1);
      assert.strictEqual(offsetX, -7);
      assert.strictEqual(pixelRatioY, 3.5);
      assert.strictEqual(offsetY, -250);
    });

    it('should map native = offset + ratio * web for every fitted sample', function () {
      const samples = [
        {native: {x: 50, y: 200}, web: {x: 10, y: 40}},
        {native: {x: 150, y: 400}, web: {x: 30, y: 80}},
      ];
      const {offsetX, offsetY, pixelRatioX, pixelRatioY} = fitAffineTransform(samples);

      for (const {native, web} of samples) {
        assert.ok(Math.abs(offsetX + web.x * pixelRatioX - native.x) < 1e-9);
        assert.ok(Math.abs(offsetY + web.y * pixelRatioY - native.y) < 1e-9);
      }
    });

    it('should least-squares fit more than 2 samples', function () {
      // exactly collinear: native = 10 + 2*web
      const samples = [
        {native: {x: 10, y: 10}, web: {x: 0, y: 0}},
        {native: {x: 30, y: 30}, web: {x: 10, y: 10}},
        {native: {x: 50, y: 50}, web: {x: 20, y: 20}},
      ];
      const {offsetX, offsetY, pixelRatioX, pixelRatioY} = fitAffineTransform(samples);

      assert.strictEqual(pixelRatioX, 2);
      assert.strictEqual(offsetX, 10);
      assert.strictEqual(pixelRatioY, 2);
      assert.strictEqual(offsetY, 10);
    });

    it('should throw with fewer than 2 samples', function () {
      assert.throws(() => fitAffineTransform([]), /At least 2 calibration samples/);
      assert.throws(
        () => fitAffineTransform([{native: {x: 0, y: 0}, web: {x: 0, y: 0}}]),
        /At least 2 calibration samples/,
      );
    });

    it('should throw when samples do not vary along an axis', function () {
      assert.throws(
        () =>
          fitAffineTransform([
            {native: {x: 10, y: 10}, web: {x: 5, y: 5}},
            {native: {x: 20, y: 20}, web: {x: 5, y: 15}},
          ]),
        /do not vary enough/,
      );
    });
  });

  describe('viewportSignature', function () {
    it('should produce the same signature for identical states', function () {
      const state = {orientation: 'PORTRAIT' as const, innerWidth: 375, innerHeight: 812, isScrolledToTop: true};
      assert.strictEqual(viewportSignature(state), viewportSignature({...state}));
    });

    it('should change when orientation changes', function () {
      const base = {orientation: 'PORTRAIT' as const, innerWidth: 375, innerHeight: 812, isScrolledToTop: true};
      assert.notStrictEqual(viewportSignature(base), viewportSignature({...base, orientation: 'LANDSCAPE'}));
    });

    it('should change when the viewport size changes', function () {
      const base = {orientation: 'PORTRAIT' as const, innerWidth: 375, innerHeight: 812, isScrolledToTop: true};
      assert.notStrictEqual(viewportSignature(base), viewportSignature({...base, innerHeight: 700}));
    });

    it('should change when scroll position changes', function () {
      const base = {orientation: 'PORTRAIT' as const, innerWidth: 375, innerHeight: 812, isScrolledToTop: true};
      assert.notStrictEqual(viewportSignature(base), viewportSignature({...base, isScrolledToTop: false}));
    });
  });
});
