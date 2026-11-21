import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {describe, it} from 'node:test';

import {
  mobileGetMediaStreamCapabilities,
  mobileStartMediaStream,
  mobileStopMediaStream,
} from '../../../lib/commands/media-stream.js';

function fakeDriver(extra: Record<string, unknown> = {}) {
  return {
    isSimulator: () => true,
    xcodeVersion: {major: 27},
    eventEmitter: new EventEmitter(),
    bidiEventSubs: {},
    log: {debug() {}, warn() {}, info() {}},
    ...extra,
  } as any;
}

const start = (driver: any, ...args: any[]) =>
  (mobileStartMediaStream as (...a: any[]) => Promise<unknown>).call(driver, ...args);

describe('mobile: getMediaStreamCapabilities', function () {
  it('offers both kinds, both codecs and audio on a simulator', async function () {
    assert.deepEqual(await mobileGetMediaStreamCapabilities.call(fakeDriver()), {
      supported: true,
      source: 'simulator',
      kinds: ['video', 'jpeg'],
      codecs: ['h264', 'hevc'],
      audio: true,
    });
  });

  it('reports a typed reason for Xcode < 26', async function () {
    const caps = await mobileGetMediaStreamCapabilities.call(fakeDriver({xcodeVersion: {major: 25}}));
    assert.equal(caps.supported, false);
    assert.equal(caps.reason?.code, 'xcode_too_old');
  });

  const realDevice = (platformVersion: string, tunnel = true) =>
    fakeDriver({
      isSimulator: () => false,
      opts: {platformVersion},
      remoteXPCFacade: {isTunnelTier: async () => tunnel},
    });

  it('reports a typed reason for a real device older than 27', async function () {
    const caps = await mobileGetMediaStreamCapabilities.call(realDevice('26.4'));
    assert.deepEqual([caps.supported, caps.source, caps.reason?.code], [false, 'device', 'os_too_old']);
  });

  it('reports a typed reason for a real device without a tunnel', async function () {
    const caps = await mobileGetMediaStreamCapabilities.call(realDevice('27.0', false));
    assert.equal(caps.reason?.code, 'tunnel_required');
  });
});

describe('mobile: startMediaStream', function () {
  it('rejects an unknown kind', async function () {
    await assert.rejects(start(fakeDriver(), 'audio' as any), /'kind' must be either/);
  });

  it('rejects options that do not apply to the kind', async function () {
    await assert.rejects(start(fakeDriver(), 'video', undefined, undefined, undefined, 50), /'quality'.*'video'/);
    await assert.rejects(start(fakeDriver(), 'jpeg', 'hevc'), /'codec'.*'jpeg'/);
  });

  it('rejects out-of-range numeric options', async function () {
    await assert.rejects(start(fakeDriver(), 'video', 5 as any), /'codec' must be either/);
    await assert.rejects(start(fakeDriver(), 'video', undefined, 0), /'fps' must be a number between 1 and 120/);
    await assert.rejects(start(fakeDriver(), 'video', undefined, undefined, 'abc'), /'bitrate' must be a number/);
    await assert.rejects(
      start(fakeDriver(), 'jpeg', undefined, undefined, undefined, 101),
      /'quality' must be.*0 and 100/,
    );
    await assert.rejects(
      start(fakeDriver(), 'jpeg', undefined, undefined, undefined, undefined, 0),
      /'scale' must be.*1 and 100/,
    );
  });

  it('rejects a non-boolean audio flag', async function () {
    await assert.rejects(
      start(fakeDriver(), 'video', undefined, undefined, undefined, undefined, undefined, 'false' as any),
      /'audio' must be a boolean/,
    );
  });

  it('rejects a batch window that is not an integer in range', async function () {
    const withBatch = (batchMs: unknown) => start(fakeDriver(), 'video', ...Array(7).fill(undefined), batchMs);
    await assert.rejects(withBatch(-1), /'batchMs' must be an integer between 0 and 1000/);
    await assert.rejects(withBatch(1.5), /'batchMs'/);
    await assert.rejects(withBatch(2 ** 31), /'batchMs'/);
  });

  it('rejects an idle heartbeat that would flood the client', async function () {
    const withHeartbeat = (ms: unknown) => start(fakeDriver(), 'jpeg', ...Array(8).fill(undefined), ms);
    await assert.rejects(withHeartbeat(1), /'idleHeartbeatMs' must be 0 or/);
    await assert.rejects(withHeartbeat(99), /'idleHeartbeatMs'/);
    await assert.rejects(withHeartbeat(2 ** 31), /'idleHeartbeatMs'/);
    await assert.rejects(withHeartbeat(-1), /'idleHeartbeatMs'/);
  });

  it('rejects a keyframe interval that is not 0 or an integer in range, or is set for jpeg', async function () {
    const withInterval = (ms: unknown, kind = 'video') => start(fakeDriver(), kind, ...Array(9).fill(undefined), ms);
    const outOfRange = /'keyFrameIntervalMs' must be 0 or an integer between 1000 and 60000/;
    await assert.rejects(withInterval(999), outOfRange);
    await assert.rejects(withInterval(60_001), outOfRange);
    await assert.rejects(withInterval(1500.5), outOfRange);
    await assert.rejects(withInterval(-4000), outOfRange);
    await assert.rejects(withInterval('4000'), /'keyFrameIntervalMs' must be.*got '4000'/);
    await assert.rejects(withInterval(4000, 'jpeg'), /'keyFrameIntervalMs' not supported for kind 'jpeg'/);
  });

  it('accepts a keyframe interval in range, and 0', async function () {
    for (const ms of [0, 1000, 4000, 60_000]) {
      const driver = fakeDriver({
        device: {
          startVideoStream: async () => {
            throw new Error('reached the simulator');
          },
        },
      });
      await assert.rejects(start(driver, 'video', ...Array(9).fill(undefined), ms), /reached the simulator/);
    }
  });

  it('rejects fps and bitrate above the limits', async function () {
    await assert.rejects(start(fakeDriver(), 'video', undefined, 121), /'fps' must be.*between 1 and 120/);
    await assert.rejects(
      start(fakeDriver(), 'video', undefined, undefined, 100_000_001),
      /'bitrate' must be.*between 1 and 100000000/,
    );
  });

  it('fails with the capability reason when unsupported', async function () {
    await assert.rejects(start(fakeDriver({xcodeVersion: {major: 25}}), 'jpeg'), /requires Xcode 26/);
  });

  it('keeps accepting a stop for an ended stream after another one started', async function () {
    const stream = () => {
      let end!: () => void;
      const ended = new Promise<void>((resolve) => (end = resolve));
      return {
        async *frames() {
          await ended;
          yield* [];
        },
        stop: async () => end(),
      };
    };
    const driver = fakeDriver({device: {startJpegStream: async () => stream()}});
    const first = (await start(driver, 'jpeg')) as {streamId: string};
    await mobileStopMediaStream.call(driver, first.streamId);
    assert.equal(driver._mediaStreams.size, 0);
    const second = (await start(driver, 'jpeg')) as {streamId: string};
    await mobileStopMediaStream.call(driver, first.streamId);
    assert.equal(driver._mediaStreams.size, 1);
    await mobileStopMediaStream.call(driver, second.streamId);
    assert.equal(driver._mediaStreams.size, 0);
    await assert.rejects(mobileStopMediaStream.call(driver, 'nope'), /Unknown media stream id/);
  });

  it('rejects stopping an unknown stream', async function () {
    await assert.rejects(mobileStopMediaStream.call(fakeDriver(), 'nope'), /Unknown media stream id/);
  });
});
