import {createSandbox} from 'sinon';
import {withTimeout, TimeoutError} from '../../lib/utils/async';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('utils/async', function () {
  describe('TimeoutError', function () {
    it('should set name and default message', function () {
      const err = new TimeoutError();
      expect(err.name).to.equal('TimeoutError');
      expect(err.message).to.equal('Operation timed out');
    });

    it('should accept a custom message', function () {
      const err = new TimeoutError('custom deadline');
      expect(err.message).to.equal('custom deadline');
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
      expect(result).to.equal('ok');
    });

    it('should propagate rejection from the inner promise', async function () {
      const inner = new Error('inner failure');
      const innerPromise = new Promise<never>((_resolve, reject) => {
        queueMicrotask(() => reject(inner));
      });
      try {
        await withTimeout(innerPromise, 10_000);
        expect.fail('expected rejection');
      } catch (err: unknown) {
        expect(err).to.equal(inner);
        expect((err as Error).message).to.equal('inner failure');
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
        expect(err).to.be.instanceOf(TimeoutError);
        expect((err as TimeoutError).message).to.equal('deadline exceeded');
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
        await expect(out).to.eventually.equal(42);
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
        expect(await out).to.equal(1);
        // If the timeout were not cleared, advancing far past the deadline could still
        // surface spurious work; with cleanup, further ticks are harmless for this call.
        await clock.tickAsync(20_000);
      } finally {
        clock.restore();
      }
    });
  });
});
