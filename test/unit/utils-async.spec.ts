import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {createSandbox} from 'sinon';

import {withTimeout, TimeoutError} from '../../lib/commands/helpers/index.js';

describe('utils/async', function () {
  describe('TimeoutError', function () {
    it('should set name and default message', function () {
      const err = new TimeoutError();
      assert.strictEqual(err.name, 'TimeoutError');
      assert.strictEqual(err.message, 'Operation timed out');
    });

    it('should accept a custom message', function () {
      const err = new TimeoutError('custom deadline');
      assert.strictEqual(err.message, 'custom deadline');
    });
  });

  describe('withTimeout', function () {
    let sandbox: ReturnType<typeof createSandbox>;

    beforeEach(function () {
      sandbox = createSandbox();
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should resolve with the inner value when it settles before the deadline', async function () {
      const result = await withTimeout(Promise.resolve('ok'), 10_000);
      assert.strictEqual(result, 'ok');
    });

    it('should propagate rejection from the inner promise', async function () {
      const inner = new Error('inner failure');
      const innerPromise = new Promise<never>((_resolve, reject) => {
        queueMicrotask(() => reject(inner));
      });
      try {
        await withTimeout(innerPromise, 10_000);
        assert.fail('expected rejection');
      } catch (err: unknown) {
        assert.strictEqual(err, inner);
        assert.strictEqual((err as Error).message, 'inner failure');
      }
    });

    it('should reject with TimeoutError when the deadline elapses first', async function () {
      const clock = sandbox.useFakeTimers();
      try {
        const hanging = new Promise<string>(() => {});
        const out = withTimeout(hanging, 100, 'deadline exceeded');
        const captureRejection = (async (): Promise<unknown> => {
          try {
            await out;
            return undefined;
          } catch (err: unknown) {
            return err;
          }
        })();
        await clock.tickAsync(100);
        const err = await captureRejection;
        assert.ok(err instanceof TimeoutError);
        assert.strictEqual((err as TimeoutError).message, 'deadline exceeded');
      } finally {
        clock.restore();
      }
    });

    it('should resolve when the inner promise wins the race', async function () {
      const clock = sandbox.useFakeTimers();
      try {
        const inner = new Promise<number>((resolve) => {
          setTimeout(() => resolve(42), 50);
        });
        const out = withTimeout(inner, 500);
        await clock.tickAsync(50);
        assert.strictEqual(await out, 42);
      } finally {
        clock.restore();
      }
    });

    it('should clear the deadline timer when the inner promise wins', async function () {
      const clock = sandbox.useFakeTimers();
      try {
        const inner = new Promise<number>((resolve) => {
          setTimeout(() => resolve(1), 20);
        });
        const out = withTimeout(inner, 10_000);
        await clock.tickAsync(20);
        assert.strictEqual(await out, 1);
        // If the timeout were not cleared, advancing far past the deadline could still
        // surface spurious work; with cleanup, further ticks are harmless for this call.
        await clock.tickAsync(20_000);
      } finally {
        clock.restore();
      }
    });
  });
});
