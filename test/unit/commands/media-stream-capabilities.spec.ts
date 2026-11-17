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
    assert.match(caps.reason?.message ?? '', /OpenH264 2\.6\.0/);
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
      /Kind 'video' is not available for device streaming: .*OpenH264 2\.6\.0/,
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
