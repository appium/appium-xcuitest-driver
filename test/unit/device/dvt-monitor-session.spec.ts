import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {describe, it} from 'node:test';
import {setImmediate} from 'node:timers/promises';

import type {AppiumLogger} from '@appium/types';
import sinon from 'sinon';

import {mobileStartNetworkMonitor, mobileStopNetworkMonitor} from '../../../lib/commands/network-monitor.js';
import {mobileStartSystemMonitor, mobileStopSystemMonitor} from '../../../lib/commands/system-monitor.js';
import type {DvtMonitorSession} from '../../../lib/device/dvt-monitor-session.js';
import {NetworkMonitorSession} from '../../../lib/device/network-monitor-session.js';
import type {RemoteXPCFacade} from '../../../lib/device/remote-xpc/index.js';
import {SystemMonitorSession} from '../../../lib/device/system-monitor-session.js';

/** Receives a promise that resolves once the instrument is asked to stop */
type Stream = (stopped: Promise<void>) => AsyncGenerator<object>;

interface Fixture {
  name: string;
  /** Builds a fake DVT whose instrument yields the given stream */
  createDvt(stream: () => AsyncGenerator<object>, stop: sinon.SinonStub): any;
  create(log: AppiumLogger, facade: RemoteXPCFacade): DvtMonitorSession & {start(e: EventEmitter): Promise<void>};
  startCommand: (this: any) => Promise<void>;
  stopCommand: (this: any) => Promise<void>;
  sessionProp: '_networkMonitorSession' | '_systemMonitorSession';
  /** The instrument's eager-start stub */
  startStub(dvt: any): sinon.SinonStub;
}

const fixtures: Fixture[] = [
  {
    name: 'NetworkMonitorSession',
    createDvt: (events, stop) => ({networkMonitor: {events, stop, start: sinon.stub().resolves()}}),
    create: (log, facade) => new NetworkMonitorSession(log, 'udid', facade),
    startCommand: mobileStartNetworkMonitor,
    stopCommand: mobileStopNetworkMonitor,
    sessionProp: '_networkMonitorSession',
    startStub: (dvt) => dvt.networkMonitor.start,
  },
  {
    name: 'SystemMonitorSession',
    createDvt: (messages, stop) => ({
      sysmontap: {
        messages,
        stop,
        getSystemAttributes: () => ['cpuUsage'],
        configure: sinon.stub().resolves(),
        start: sinon.stub().resolves(),
      },
    }),
    create: (log, facade) => new SystemMonitorSession(log, 'udid', facade),
    startCommand: mobileStartSystemMonitor,
    stopCommand: mobileStopSystemMonitor,
    sessionProp: '_systemMonitorSession',
    startStub: (dvt) => dvt.sysmontap.start,
  },
];

function setup(fixture: Fixture, stream: Stream) {
  const close = sinon.stub().resolves();
  const stopped = Promise.withResolvers<void>();
  const stop = sinon.stub().callsFake(async () => stopped.resolve());
  const dvt = {dvtService: {close}, ...fixture.createDvt(() => stream(stopped.promise), stop)};
  const requireTunnelService = sinon.stub().callsFake(async (_label, op) => op({startDVTService: async () => dvt}));
  const facade = {requireTunnelService} as unknown as RemoteXPCFacade;
  const log = {
    debug: sinon.stub(),
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
  } as unknown as AppiumLogger;
  return {dvt, close, stop, facade, log, requireTunnelService, session: fixture.create(log, facade)};
}

/** Waits until the session stops reporting as running, failing fast instead of hanging */
async function untilStopped(session: DvtMonitorSession): Promise<void> {
  for (let i = 0; i < 50 && session.isRunning(); i++) {
    await setImmediate();
  }
}

for (const fixture of fixtures) {
  describe(fixture.name, function () {
    for (const throws of [false, true]) {
      it(`clears running state and closes DVT when the stream ${throws ? 'throws after an event' : 'returns'}`, async function () {
        const {session, close, log} = setup(fixture, async function* () {
          if (throws) {
            yield {System: [1]};
            throw new Error('tunnel dropped');
          }
        });
        const emitter = new EventEmitter();
        const emit = sinon.spy(emitter, 'emit');

        await session.start(emitter);
        await untilStopped(session);

        assert.strictEqual(session.isRunning(), false);
        assert.strictEqual(close.calledOnce, true);
        assert.strictEqual(emit.callCount, throws ? 1 : 0);
        // The unexpected end must be logged either way
        const logged = (throws ? log.error : log.warn) as sinon.SinonStub;
        assert.strictEqual(logged.calledOnce, true);
      });
    }

    it('is not running while the DVT close is still in flight', async function () {
      const {session, close} = setup(fixture, async function* () {});
      const closing = Promise.withResolvers<void>();
      close.callsFake(() => closing.promise);

      await session.start(new EventEmitter());
      await untilStopped(session);
      assert.strictEqual(close.calledOnce, true);
      assert.strictEqual(session.isRunning(), false);
      closing.resolve();
    });

    it('ignores start() while already running without touching the live stream', async function () {
      const {session, close, stop, requireTunnelService} = setup(fixture, async function* (stopped) {
        yield {};
        await stopped;
      });
      await session.start(new EventEmitter());
      await session.start(new EventEmitter());

      assert.strictEqual(requireTunnelService.calledOnce, true);
      assert.strictEqual(session.isRunning(), true);
      await session.interrupt();
      assert.strictEqual(stop.calledOnce, true);
      assert.strictEqual(close.calledOnce, true);
    });

    it('interrupts a running stream and closes DVT once', async function () {
      const {session, close, stop} = setup(fixture, async function* (stopped) {
        yield {};
        await stopped;
      });

      await session.start(new EventEmitter());
      assert.strictEqual(session.isRunning(), true);
      await session.interrupt();

      assert.strictEqual(session.isRunning(), false);
      assert.strictEqual(stop.calledOnce, true);
      assert.strictEqual(close.calledOnce, true);
    });

    it('closes DVT when interrupted while the service is still opening', async function () {
      const {session, close, dvt, facade} = setup(fixture, async function* () {});
      const opening = Promise.withResolvers<void>();
      (facade.requireTunnelService as sinon.SinonStub).callsFake(async () => {
        await opening.promise;
        return dvt;
      });

      const starting = session.start(new EventEmitter());
      await session.interrupt();
      opening.resolve();
      await starting;

      assert.strictEqual(session.isRunning(), false);
      assert.strictEqual(close.calledOnce, true);
    });

    it('stores the session before starting so concurrent starts and teardown see it', async function () {
      const {facade, log, requireTunnelService, close, dvt} = setup(fixture, async function* (stopped) {
        yield {};
        await stopped;
      });
      const opening = Promise.withResolvers<void>();
      requireTunnelService.callsFake(async () => {
        await opening.promise;
        return dvt;
      });
      const driver: any = {
        isRealDevice: () => true,
        opts: {platformName: 'iOS', platformVersion: '18.0'},
        device: {udid: 'udid'},
        log,
        eventEmitter: new EventEmitter(),
        remoteXPCFacade: facade,
      };

      const first = fixture.startCommand.call(driver);
      const session = driver[fixture.sessionProp];
      assert.ok(session);
      const second = fixture.startCommand.call(driver);
      assert.strictEqual(driver[fixture.sessionProp], session);

      await session.interrupt();
      opening.resolve();
      await Promise.all([first, second]);

      assert.strictEqual(requireTunnelService.calledOnce, true);
      assert.strictEqual(session.isRunning(), false);
      assert.strictEqual(close.calledOnce, true);
    });

    it('keeps a newer session registered when an older stop command finishes late', async function () {
      const a = setup(fixture, async function* () {});
      const b = setup(fixture, async function* (stopped) {
        yield {};
        await stopped;
      });
      const gate = Promise.withResolvers<void>();
      fixture.startStub(a.dvt).callsFake(() => gate.promise);
      const closing = Promise.withResolvers<void>();
      a.close.callsFake(() => closing.promise);
      const driver: any = {
        isRealDevice: () => true,
        opts: {platformName: 'iOS', platformVersion: '18.0'},
        device: {udid: 'udid'},
        log: a.log,
        eventEmitter: new EventEmitter(),
        remoteXPCFacade: a.facade,
      };

      const startingA = fixture.startCommand.call(driver);
      await setImmediate();
      const sessionA = driver[fixture.sessionProp];
      const stoppingA = fixture.stopCommand.call(driver);
      await setImmediate();
      gate.resolve();
      await startingA;
      assert.strictEqual(sessionA.isRunning(), false);

      driver.remoteXPCFacade = b.facade;
      await fixture.startCommand.call(driver);
      const sessionB = driver[fixture.sessionProp];
      assert.notStrictEqual(sessionB, sessionA);

      closing.resolve();
      await stoppingA;

      assert.strictEqual(driver[fixture.sessionProp], sessionB);
      assert.strictEqual(sessionB.isRunning(), true);
      await fixture.stopCommand.call(driver);
      assert.strictEqual(sessionB.isRunning(), false);
      assert.strictEqual(driver[fixture.sessionProp], null);
    });

    it('starts a new session through the command after the previous stream ended', async function () {
      const first = setup(fixture, async function* () {});
      const second = setup(fixture, async function* (stopped) {
        yield {};
        await stopped;
      });
      const driver: any = {
        isRealDevice: () => true,
        opts: {platformName: 'iOS', platformVersion: '18.0'},
        device: {udid: 'udid'},
        log: first.log,
        eventEmitter: new EventEmitter(),
        remoteXPCFacade: first.facade,
      };

      await fixture.startCommand.call(driver);
      const ended = driver[fixture.sessionProp];
      await untilStopped(ended);
      assert.strictEqual(ended.isRunning(), false);

      driver.remoteXPCFacade = second.facade;
      await fixture.startCommand.call(driver);

      const restarted = driver[fixture.sessionProp];
      assert.notStrictEqual(restarted, ended);
      assert.strictEqual(restarted.isRunning(), true);
      assert.strictEqual(second.requireTunnelService.calledOnce, true);
      await restarted.interrupt();
    });
  });
}

for (const f of fixtures) {
  describe(`${f.name} setup`, function () {
    /** Makes the instrument's eager start block until released */
    function blockStart(dvt: any) {
      const gate = Promise.withResolvers<void>();
      f.startStub(dvt).callsFake(() => gate.promise);
      return gate;
    }

    it('starts the instrument exactly once', async function () {
      const {session, dvt} = setup(f, async function* (stopped) {
        yield {};
        await stopped;
      });

      await session.start(new EventEmitter());

      assert.strictEqual(f.startStub(dvt).calledOnce, true);
      await session.interrupt();
    });

    it('rejects and closes DVT when the instrument fails to start', async function () {
      const {session, close, dvt} = setup(f, async function* () {});
      const error = new Error('start failed');
      f.startStub(dvt).rejects(error);

      await assert.rejects(session.start(new EventEmitter()), error);

      assert.strictEqual(close.calledOnce, true);
      assert.strictEqual(session.isRunning(), false);
    });

    it('closes DVT when interrupted during setup', async function () {
      const {session, close, dvt} = setup(f, async function* () {});
      const gate = blockStart(dvt);

      const starting = session.start(new EventEmitter());
      await setImmediate();
      await session.interrupt();
      gate.resolve();
      await starting;

      assert.strictEqual(session.isRunning(), false);
      assert.strictEqual(close.calledOnce, true);
    });

    it('does not close twice or reject when interrupted and setup then fails', async function () {
      const {session, close, dvt} = setup(f, async function* () {});
      const gate = blockStart(dvt);

      const starting = session.start(new EventEmitter());
      await setImmediate();
      await session.interrupt();
      gate.reject(new Error('connection closed'));

      await assert.doesNotReject(starting);
      assert.strictEqual(close.calledOnce, true);
      assert.strictEqual(session.isRunning(), false);
    });

    it('lets a concurrent start wait for the in-flight one', async function () {
      const {session, dvt, requireTunnelService} = setup(f, async function* (stopped) {
        yield {};
        await stopped;
      });
      const gate = blockStart(dvt);

      const first = session.start(new EventEmitter());
      await setImmediate();
      let secondDone = false;
      const second = session.start(new EventEmitter()).then(() => (secondDone = true));
      await setImmediate();
      assert.strictEqual(secondDone, false);

      gate.resolve();
      await Promise.all([first, second]);

      assert.strictEqual(requireTunnelService.calledOnce, true);
      assert.strictEqual(session.isRunning(), true);
      await session.interrupt();
    });

    it('rejects a concurrent start when the in-flight one fails', async function () {
      const {session, dvt} = setup(f, async function* () {});
      const gate = blockStart(dvt);
      const error = new Error('start failed');

      const first = assert.rejects(session.start(new EventEmitter()), error);
      await setImmediate();
      const second = assert.rejects(session.start(new EventEmitter()), error);
      await setImmediate();
      gate.reject(error);

      await Promise.all([first, second]);
      assert.strictEqual(session.isRunning(), false);
    });

    it('does not restart a start cancelled by interrupt()', async function () {
      const {session, dvt, requireTunnelService, close} = setup(f, async function* () {});
      const gate = blockStart(dvt);

      const first = session.start(new EventEmitter());
      await setImmediate();
      const interrupting = session.interrupt();
      const second = session.start(new EventEmitter());
      gate.resolve();
      await Promise.all([first, second, interrupting]);

      assert.strictEqual(requireTunnelService.calledOnce, true);
      assert.strictEqual(close.calledOnce, true);
      assert.strictEqual(session.isRunning(), false);
    });
  });
}

describe('SystemMonitorSession start', function () {
  const fixture = fixtures[1];

  it('closes DVT and stays stopped when configure() rejects', async function () {
    const {session, close, stop, dvt} = setup(fixture, async function* () {});
    const error = new Error('configuration failed');
    dvt.sysmontap.configure.rejects(error);

    await assert.rejects((session as SystemMonitorSession).start(new EventEmitter(), {intervalMs: 1000}), error);

    assert.deepStrictEqual(dvt.sysmontap.configure.firstCall.args, [{intervalMs: 1000}]);
    assert.strictEqual(close.calledOnce, true);
    assert.strictEqual(session.isRunning(), false);
    await assert.doesNotReject(session.interrupt());
    assert.strictEqual(stop.called, false);
    assert.strictEqual(close.calledOnce, true);
  });

  it('does not start sampling when interrupted while configure() is pending', async function () {
    const {session, close, dvt} = setup(fixture, async function* () {});
    const configuring = Promise.withResolvers<void>();
    dvt.sysmontap.configure.callsFake(() => configuring.promise);

    const starting = (session as SystemMonitorSession).start(new EventEmitter(), {intervalMs: 1});
    await setImmediate();
    await session.interrupt();
    configuring.resolve();
    await starting;

    assert.strictEqual(session.isRunning(), false);
    assert.strictEqual(dvt.sysmontap.start.called, false);
    assert.strictEqual(close.calledOnce, true);
  });
});
