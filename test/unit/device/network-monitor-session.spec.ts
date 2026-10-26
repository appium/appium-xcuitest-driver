import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {describe, it} from 'node:test';
import {setImmediate} from 'node:timers/promises';

import type {AppiumLogger} from '@appium/types';
import sinon from 'sinon';

import {NetworkMonitorSession} from '../../../lib/device/network-monitor-session.js';
import type {RemoteXPCFacade} from '../../../lib/device/remote-xpc/index.js';

function createSession(events: () => AsyncGenerator<object>) {
  const closed = Promise.withResolvers<void>();
  const close = sinon.stub().callsFake(async () => closed.resolve());
  const stop = sinon.stub().resolves();
  const dvt = {dvtService: {close}, networkMonitor: {events, stop}};
  const facade = {requireService: sinon.stub().resolves(dvt)} as unknown as RemoteXPCFacade;
  const log = {debug: sinon.stub(), error: sinon.stub()} as unknown as AppiumLogger;
  const session = new NetworkMonitorSession(log, 'udid', facade);
  return {session, close, stop, finished: closed.promise.then(() => setImmediate())};
}

describe('NetworkMonitorSession', function () {
  for (const throws of [false, true]) {
    it(`clears running state and closes DVT when events() ${throws ? 'throws after an event' : 'returns'}`, async function () {
      const {session, close, finished} = createSession(async function* () {
        if (throws) {
          yield {kind: 'connection'};
          throw new Error('tunnel dropped');
        }
      });
      const emitter = new EventEmitter();
      const emit = sinon.spy(emitter, 'emit');

      await session.start(emitter);
      await finished;

      assert.strictEqual(session.isRunning(), false);
      assert.strictEqual(close.calledOnce, true);
      assert.strictEqual(emit.callCount, throws ? 1 : 0);
    });
  }

  it('interrupts a running stream and closes DVT once', async function () {
    const stopped = Promise.withResolvers<void>();
    const {session, close, stop} = createSession(async function* () {
      yield {};
      await stopped.promise;
    });
    stop.callsFake(async () => stopped.resolve());

    await session.start(new EventEmitter());
    assert.strictEqual(session.isRunning(), true);
    await session.interrupt();

    assert.strictEqual(session.isRunning(), false);
    assert.strictEqual(stop.calledOnce, true);
    assert.strictEqual(close.calledOnce, true);
  });
});
