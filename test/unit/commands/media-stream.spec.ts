import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {describe, it} from 'node:test';

import {
  mobileGetMediaStreamCapabilities,
  mobileStartMediaStream,
  mobileStopMediaStream,
} from '../../../lib/commands/media-stream.js';
import {executeMethodMap} from '../../../lib/execute-method-map.js';

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

// Calls the command as `mobile: startMediaStream` does: Appium passes the named params in the order the
// execute method map lists them
const {required, optional} = executeMethodMap['mobile: startMediaStream'].params;
const start = (driver: any, params: Record<string, unknown>) =>
  (mobileStartMediaStream as (...a: unknown[]) => Promise<unknown>).call(
    driver,
    ...[...required, ...optional].map((name) => params[name]),
  );

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
    await assert.rejects(start(fakeDriver(), {kind: 'audio'}), /'kind' must be either/);
  });

  it('rejects options that do not apply to the kind', async function () {
    await assert.rejects(start(fakeDriver(), {kind: 'video', quality: 50}), /'quality'.*'video'/);
    await assert.rejects(start(fakeDriver(), {kind: 'jpeg', codec: 'hevc'}), /'codec'.*'jpeg'/);
  });

  it('rejects out-of-range numeric options', async function () {
    await assert.rejects(start(fakeDriver(), {kind: 'video', codec: 5}), /'codec' must be either/);
    await assert.rejects(start(fakeDriver(), {kind: 'video', fps: 0}), /'fps' must be a number between 1 and 120/);
    await assert.rejects(start(fakeDriver(), {kind: 'video', bitrate: 'abc'}), /'bitrate' must be a number/);
    await assert.rejects(start(fakeDriver(), {kind: 'jpeg', quality: 101}), /'quality' must be.*0 and 100/);
    await assert.rejects(start(fakeDriver(), {kind: 'jpeg', scale: 0}), /'scale' must be.*1 and 100/);
  });

  it('rejects a non-boolean audio flag', async function () {
    await assert.rejects(start(fakeDriver(), {kind: 'video', audio: 'false'}), /'audio' must be a boolean/);
  });

  it('rejects a batch window that is not an integer in range', async function () {
    const withBatch = (batchMs: unknown) => start(fakeDriver(), {kind: 'video', batchMs});
    await assert.rejects(withBatch(-1), /'batchMs' must be an integer between 0 and 1000/);
    await assert.rejects(withBatch(1.5), /'batchMs'/);
    await assert.rejects(withBatch(2 ** 31), /'batchMs'/);
  });

  it('rejects an idle heartbeat that would flood the client', async function () {
    const withHeartbeat = (idleHeartbeatMs: unknown) => start(fakeDriver(), {kind: 'jpeg', idleHeartbeatMs});
    await assert.rejects(withHeartbeat(1), /'idleHeartbeatMs' must be 0 or/);
    await assert.rejects(withHeartbeat(99), /'idleHeartbeatMs'/);
    await assert.rejects(withHeartbeat(2 ** 31), /'idleHeartbeatMs'/);
    await assert.rejects(withHeartbeat(-1), /'idleHeartbeatMs'/);
  });

  it('rejects a keyframe interval that is not 0 or an integer in range, or is set for jpeg', async function () {
    const withInterval = (keyFrameIntervalMs: unknown, kind = 'video') =>
      start(fakeDriver(), {kind, keyFrameIntervalMs});
    const outOfRange = /'keyFrameIntervalMs' must be 0 or an integer between 1000 and 60000/;
    await assert.rejects(withInterval(999), outOfRange);
    await assert.rejects(withInterval(60_001), outOfRange);
    await assert.rejects(withInterval(1500.5), outOfRange);
    await assert.rejects(withInterval(-4000), outOfRange);
    await assert.rejects(withInterval('4000'), /'keyFrameIntervalMs' must be.*got '4000'/);
    await assert.rejects(withInterval(4000, 'jpeg'), /'keyFrameIntervalMs' not supported for kind 'jpeg'/);
  });

  it('accepts a keyframe interval in range, and 0', async function () {
    for (const keyFrameIntervalMs of [0, 1000, 4000, 60_000]) {
      const driver = fakeDriver({
        device: {
          startVideoStream: async () => {
            throw new Error('reached the simulator');
          },
        },
      });
      await assert.rejects(start(driver, {kind: 'video', keyFrameIntervalMs}), /reached the simulator/);
    }
  });

  it('rejects fps and bitrate above the limits', async function () {
    await assert.rejects(start(fakeDriver(), {kind: 'video', fps: 121}), /'fps' must be.*between 1 and 120/);
    await assert.rejects(
      start(fakeDriver(), {kind: 'video', bitrate: 100_000_001}),
      /'bitrate' must be.*between 1 and 100000000/,
    );
  });

  it('fails with the capability reason when unsupported', async function () {
    await assert.rejects(start(fakeDriver({xcodeVersion: {major: 25}}), {kind: 'jpeg'}), /requires Xcode 26/);
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
    const first = (await start(driver, {kind: 'jpeg'})) as {streamId: string};
    await mobileStopMediaStream.call(driver, first.streamId);
    assert.equal(driver._mediaStreams.size, 0);
    const second = (await start(driver, {kind: 'jpeg'})) as {streamId: string};
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
