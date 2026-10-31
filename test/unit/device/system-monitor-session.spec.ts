import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {describe, it} from 'node:test';
import {setImmediate} from 'node:timers/promises';

import type {AppiumLogger} from '@appium/types';
import type {SysmonSample} from 'appium-ios-remotexpc';
import sinon from 'sinon';

import type {RemoteXPCFacade} from '../../../lib/device/remote-xpc/index.js';
import {SystemMonitorSession} from '../../../lib/device/system-monitor-session.js';

function createSession(messages: () => AsyncGenerator<SysmonSample>) {
  const closed = Promise.withResolvers<void>();
  const close = sinon.stub().callsFake(async () => closed.resolve());
  const stop = sinon.stub().resolves();
  const configure = sinon.stub().resolves();
  const sysmontap = {messages, stop, configure, getSystemAttributes: () => ['cpuUsage']};
  const dvt = {dvtService: {close}, sysmontap};
  const facade = {requireService: sinon.stub().resolves(dvt)} as unknown as RemoteXPCFacade;
  const log = {debug: sinon.stub(), error: sinon.stub()} as unknown as AppiumLogger;
  const session = new SystemMonitorSession(log, 'udid', facade);
  return {session, close, stop, configure, finished: closed.promise.then(() => setImmediate())};
}

describe('SystemMonitorSession', function () {
  for (const throws of [false, true]) {
    it(`clears running state and closes DVT when messages() ${throws ? 'throws after a sample' : 'returns'}`, async function () {
      const {session, close, finished} = createSession(async function* () {
        if (throws) {
          yield {System: [1]};
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

  it('closes DVT and stays stopped when configure() rejects', async function () {
    const {session, close, stop, configure} = createSession(async function* () {});
    const error = new Error('configuration failed');
    configure.rejects(error);

    await assert.rejects(session.start(new EventEmitter(), {intervalMs: 1000}), error);

    assert.deepStrictEqual(configure.firstCall.args, [{intervalMs: 1000}]);
    assert.strictEqual(close.calledOnce, true);
    assert.strictEqual(session.isRunning(), false);
    await assert.doesNotReject(session.interrupt());
    assert.strictEqual(stop.called, false);
    assert.strictEqual(close.calledOnce, true);
  });

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
