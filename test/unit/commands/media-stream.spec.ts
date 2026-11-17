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
    await assert.rejects(start(fakeDriver(), 'video', undefined, 0), /'fps' must be a number >= 1/);
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

  it('rejects a non-integer batch window', async function () {
    await assert.rejects(start(fakeDriver(), 'video', ...Array(7).fill(undefined), -1 as any), /non-negative/);
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
    const second = (await start(driver, 'jpeg')) as {streamId: string};
    await mobileStopMediaStream.call(driver, first.streamId);
    await mobileStopMediaStream.call(driver, second.streamId);
  });

  it('rejects stopping an unknown stream', async function () {
    await assert.rejects(mobileStopMediaStream.call(fakeDriver(), 'nope'), /Unknown media stream id/);
  });
});
