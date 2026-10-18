import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {describe, it, afterEach} from 'node:test';

import {errors} from 'appium/driver.js';
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

  describe('executeAtom', function () {
    const run = async (atom: any, opts?: {isUserScript?: boolean}, scriptTimeoutMs: number | null = 500) => {
      const otherDriver = new XCUITestDriver({} as any);
      otherDriver.setScriptTimeout(scriptTimeoutMs);
      const remoteExecuteAtom = sinon.stub().resolves('raw');
      otherDriver._remote = {executeAtom: remoteExecuteAtom} as any;
      sinon.stub(otherDriver, 'waitForAtom').resolves('raw');
      await otherDriver.executeAtom(atom, ['x', []], true, opts);
      return {remoteArgs: remoteExecuteAtom.lastCall.args};
    };

    it('gives the session script timeout to the remote debugger for a user script', async function () {
      const {remoteArgs} = await run('execute_script', {isUserScript: true});
      assert.deepStrictEqual(remoteArgs, ['execute_script', ['x', []], [], {timeoutMs: 500}]);
    });

    it('keeps an explicit script timeout of 0', async function () {
      const {remoteArgs} = await run('execute_script', {isUserScript: true}, 0);
      assert.strictEqual(remoteArgs[3].timeoutMs, 0);
    });

    it('limits the script timeout to 1 h', async function () {
      const {remoteArgs} = await run('execute_script', {isUserScript: true}, Number.MAX_SAFE_INTEGER);
      assert.strictEqual(remoteArgs[3].timeoutMs, 3600000);
    });

    it('limits a W3C null script timeout (no limit) to 1 h', async function () {
      const {remoteArgs} = await run('execute_script', {isUserScript: true}, null);
      assert.strictEqual(remoteArgs[3].timeoutMs, 3600000);
    });

    it('gives no script timeout to other atoms and internal scripts', async function () {
      for (const [atom, opts] of [
        ['get_text', undefined],
        ['execute_script', undefined],
      ] as const) {
        const {remoteArgs} = await run(atom, opts);
        assert.deepStrictEqual(remoteArgs[3], {});
      }
    });
  });

  describe('waitForAtom', function () {
    it('stops at webviewAtomWaitTimeout, also when the script timeout is longer', async function () {
      const otherDriver = new XCUITestDriver({webviewAtomWaitTimeout: 1000} as any);
      otherDriver.setScriptTimeout(30000);
      // no alert monitor after the initial wait
      otherDriver._waitingAtoms.alertMonitor = Promise.resolve();
      // only these: with a fake nextTick, the test runner stops reporting the next tests
      const clock = sinon.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
      try {
        let error: any;
        otherDriver.waitForAtom(new Promise(() => {})).catch((err) => {
          error = err;
        });
        await clock.tickAsync(999);
        const errorBefore = error;
        await clock.tickAsync(1);
        assert.strictEqual(errorBefore, undefined);
        assert.ok(error instanceof errors.TimeoutError && !(error instanceof errors.ScriptTimeoutError));
        assert.match(error.message, /did not respond/);
      } finally {
        clock.restore();
      }
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
    const BASE_STATE = {
      orientation: 'PORTRAIT' as const,
      innerWidth: 375,
      innerHeight: 812,
      isScrolledToTop: true,
      visualViewportWidth: 375,
      visualViewportHeight: 812,
      visualViewportOffsetLeft: 0,
      visualViewportOffsetTop: 0,
      visualViewportScale: 1,
    };

    it('should produce the same signature for identical states', function () {
      assert.strictEqual(viewportSignature(BASE_STATE), viewportSignature({...BASE_STATE}));
    });

    it('should change when orientation changes', function () {
      assert.notStrictEqual(
        viewportSignature(BASE_STATE),
        viewportSignature({...BASE_STATE, orientation: 'LANDSCAPE'}),
      );
    });

    it('should change when the viewport size changes', function () {
      assert.notStrictEqual(viewportSignature(BASE_STATE), viewportSignature({...BASE_STATE, innerHeight: 700}));
    });

    it('should change when scroll position changes', function () {
      assert.notStrictEqual(viewportSignature(BASE_STATE), viewportSignature({...BASE_STATE, isScrolledToTop: false}));
    });

    it('should change when the visual viewport size changes (e.g. Safari toolbar collapsing while scrolled)', function () {
      assert.notStrictEqual(
        viewportSignature(BASE_STATE),
        viewportSignature({...BASE_STATE, visualViewportHeight: 850}),
      );
    });

    it('should change when the visual viewport offset changes (e.g. the keyboard appearing)', function () {
      assert.notStrictEqual(
        viewportSignature(BASE_STATE),
        viewportSignature({...BASE_STATE, visualViewportOffsetTop: 40}),
      );
    });

    it('should change when the visual viewport scale changes', function () {
      assert.notStrictEqual(viewportSignature(BASE_STATE), viewportSignature({...BASE_STATE, visualViewportScale: 2}));
    });
  });
});
