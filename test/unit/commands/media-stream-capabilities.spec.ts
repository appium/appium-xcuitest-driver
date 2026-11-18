import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {describe, it, mock} from 'node:test';

import * as mediaProxyModule from '../../../lib/device/media-stream/media-proxy.js';

let currentLoadMediaProxy: () => Promise<unknown> = async () => ({listH264Encoders: () => ['h264_videotoolbox']});

mock.module('../../../lib/device/media-stream/media-proxy.js', {
  namedExports: {
    ...mediaProxyModule,
    loadMediaProxy: () => currentLoadMediaProxy(),
  },
});

let releaseTeardown: () => void = () => {};
let teardownStarted = false;

// Starts fine but never produces a unit; its teardown waits until the test releases it
class StuckDeviceSource {
  private closed!: () => void;
  private readonly isClosed = new Promise<void>((resolve) => (this.closed = resolve));
  async start() {}
  async *units() {
    await this.isClosed;
    yield* [];
  }
  async stop() {
    teardownStarted = true;
    this.closed();
    await new Promise<void>((resolve) => (releaseTeardown = resolve));
  }
}

mock.module('../../../lib/device/media-stream/device-source.js', {
  namedExports: {DeviceMediaSource: StuckDeviceSource},
});

const {mobileGetMediaStreamCapabilities, mobileStartMediaStream} =
  await import('../../../lib/commands/media-stream.js');

const realDevice = () =>
  ({
    isSimulator: () => false,
    xcodeVersion: {major: 27},
    eventEmitter: new EventEmitter(),
    bidiEventSubs: {},
    log: {debug() {}, warn() {}, info() {}},
    opts: {platformVersion: '27.0'},
    remoteXPCFacade: {isTunnelTier: async () => true},
  }) as any;

const capabilitiesWith = (loadMediaProxy: () => Promise<unknown>) => {
  currentLoadMediaProxy = loadMediaProxy;
  return mobileGetMediaStreamCapabilities.call(realDevice());
};

describe('mobile: getMediaStreamCapabilities on a real device with media-proxy', function () {
  it('offers video, jpeg and audio when an H.264 encoder is available', async function () {
    const caps = await capabilitiesWith(async () => ({listH264Encoders: () => ['h264_videotoolbox']}));
    assert.deepEqual(caps, {
      supported: true,
      source: 'device',
      kinds: ['video', 'jpeg'],
      codecs: ['h264'],
      audio: true,
    });
  });

  it('offers only jpeg, with a reason, when there is no H.264 encoder', async function () {
    const caps = await capabilitiesWith(async () => ({listH264Encoders: () => []}));
    assert.deepEqual([caps.supported, caps.kinds, caps.codecs, caps.audio], [true, ['jpeg'], [], false]);
    assert.equal(caps.reason?.code, 'h264_encoder_unavailable');
    assert.match(caps.reason?.message ?? '', /MEDIA_PROXY_OPENH264_PATH/);
  });

  it('is unsupported when the addon cannot be loaded', async function () {
    const caps = await capabilitiesWith(async () => ({
      listH264Encoders: () => {
        throw new Error('No usable @appium/media-proxy addon for linux-x64');
      },
    }));
    assert.deepEqual([caps.supported, caps.reason?.code], [false, 'media_proxy_unavailable']);
  });
});

describe('mobile: startMediaStream on a real device', function () {
  it('explains how to get an H.264 encoder when video is requested without one', async function () {
    currentLoadMediaProxy = async () => ({listH264Encoders: () => []});
    await assert.rejects(
      (mobileStartMediaStream as (...a: any[]) => Promise<unknown>).call(realDevice(), 'video'),
      /Kind 'video' is not available for device streaming: .*MEDIA_PROXY_OPENH264_PATH/,
    );
  });

  it('rejects a non-numeric display id', async function () {
    currentLoadMediaProxy = async () => ({listH264Encoders: () => ['h264_videotoolbox']});
    await assert.rejects(
      (mobileStartMediaStream as (...a: any[]) => Promise<unknown>).call(
        realDevice(),
        'video',
        ...Array(6).fill(undefined),
        'abc',
      ),
      /'displayId' must be a numeric display id/,
    );
  });
});

describe('mobile: startMediaStream on a real device with a stream running', function () {
  it('rejects a second stream', async function () {
    currentLoadMediaProxy = async () => ({listH264Encoders: () => ['h264_videotoolbox']});
    const driver = realDevice();
    driver._mediaStreams = new Map([['running', {kind: 'jpeg', isStopped: false}]]);
    await assert.rejects(
      (mobileStartMediaStream as (...a: any[]) => Promise<unknown>).call(driver, 'jpeg'),
      /runs one media stream at a time/,
    );
  });
});

describe('mobile: startMediaStream after a failed start on a real device', function () {
  it('rejects another start until the failed one is torn down', async function (t) {
    currentLoadMediaProxy = async () => ({listH264Encoders: () => ['h264_videotoolbox']});
    t.mock.timers.enable({apis: ['setTimeout']});
    const driver = realDevice();
    const startCmd = () => (mobileStartMediaStream as (...a: any[]) => Promise<unknown>).call(driver, 'jpeg');
    // A video stream waits for its first unit, so the start fails with the timeout
    const startVideo = () => (mobileStartMediaStream as (...a: any[]) => Promise<unknown>).call(driver, 'video');
    const first = startVideo().then(
      () => assert.fail('expected the start to fail'),
      (e: Error) => e,
    );
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    t.mock.timers.tick(5000);
    for (let i = 0; i < 10 && !teardownStarted; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ok(teardownStarted);
    await assert.rejects(startCmd(), /runs one media stream at a time/);
    releaseTeardown();
    assert.match(String(await first), /produced no output within 5000ms/);
  });
});
