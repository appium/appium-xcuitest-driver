import type {Simulator} from 'appium-ios-simulator';
import {errors} from 'appium/driver.js';

import {
  DEFAULT_BATCH_MS,
  DEFAULT_IDLE_HEARTBEAT_MS,
  MEDIA_STREAM_MODULE,
  MEDIA_UNITS_EVENT,
  MIN_SIMULATOR_XCODE_MAJOR,
} from '../device/media-stream/constants.js';
import {DeviceMediaSource} from '../device/media-stream/device-source.js';
import {describeMissingH264Encoder, loadMediaProxy} from '../device/media-stream/media-proxy.js';
import {SimulatorMediaSource} from '../device/media-stream/simulator-source.js';
import {MediaStream} from '../device/media-stream/stream.js';
import type {
  MediaKind,
  MediaSource,
  MediaStreamCapabilities,
  MediaStreamInfo,
  StartMediaStreamOpts,
  VideoCodec,
} from '../device/media-stream/types.js';
import type {XCUITestDriver} from '../driver.js';
import {supportsApiLevel27} from '../utils/index.js';
import {BIDI_EVENT_NAME} from './bidi/constants.js';

declare module '../driver.js' {
  interface XCUITestDriver {
    mobileStartMediaStream(
      ...args: Parameters<typeof mobileStartMediaStream>
    ): ReturnType<typeof mobileStartMediaStream>;
    mobileStopMediaStream(...args: Parameters<typeof mobileStopMediaStream>): ReturnType<typeof mobileStopMediaStream>;
    mobileGetMediaStreamCapabilities(
      ...args: Parameters<typeof mobileGetMediaStreamCapabilities>
    ): ReturnType<typeof mobileGetMediaStreamCapabilities>;
  }
}

/**
 * Starts streaming the screen as `appium:mediaStream.*` BiDi events.
 * Subscribe to `appium:mediaStream` before calling this.
 * Simulators (Xcode 26+) encode the units themselves. Real devices (iOS/tvOS 27+, RemoteXPC tunnel) are
 * captured as HEVC and transcoded to H.264 (with AAC audio) or MJPEG by `@appium/media-proxy`; HEVC is not available there yet.
 *
 * @param kind 'video' (H.264/HEVC, optionally with AAC audio) or 'jpeg'.
 * @param codec Video codec, 'h264' by default.
 * @param fps Maximum frames per second.
 * @param bitrate Video bitrate in bits per second.
 * @param quality JPEG quality, 0-100.
 * @param scale JPEG scale in percent, 1-100.
 * @param audio Whether to add an AAC audio track (video only).
 * @param displayId The display to stream, the primary one by default.
 * @param batchMs Units batching window for video/audio. 40 by default.
 * @param idleHeartbeatMs Re-send the last JPEG after this idle time. 1000 by default, 0 disables.
 */
export async function mobileStartMediaStream(
  this: XCUITestDriver,
  kind: MediaKind,
  codec?: VideoCodec,
  fps?: number,
  bitrate?: number,
  quality?: number,
  scale?: number,
  audio?: boolean,
  displayId?: string,
  batchMs: number = DEFAULT_BATCH_MS,
  idleHeartbeatMs: number = DEFAULT_IDLE_HEARTBEAT_MS,
): Promise<MediaStreamInfo> {
  const opts: StartMediaStreamOpts = {
    kind,
    codec,
    fps,
    bitrate,
    quality,
    scale,
    audio,
    displayId,
    batchMs,
    idleHeartbeatMs,
  };
  validateOpts(opts);
  const caps = await getCapabilities(this);
  if (!caps.supported) {
    throw new errors.InvalidArgumentError(`Media streaming is not available: ${caps.reason?.message}`);
  }
  if (!caps.codecs.includes(codec ?? 'h264') && kind === 'video') {
    throw new errors.InvalidArgumentError(
      `Codec '${codec}' is not available for ${caps.source} streaming, use one of: ${caps.codecs.join(', ')}`,
    );
  }
  if (audio && !caps.audio) {
    throw new errors.InvalidArgumentError(`Audio is not available for ${caps.source} streaming yet`);
  }
  const source: MediaSource = this.isSimulator()
    ? new SimulatorMediaSource(this.device as Simulator, opts)
    : new DeviceMediaSource(this.remoteXPCFacade, opts, this.log);

  const streams = (this._mediaStreams ??= new Map());
  for (const [id, s] of streams) {
    if (s.isStopped) {
      streams.delete(id);
    }
  }
  if ([...streams.values()].some((s) => s.kind === kind)) {
    throw new errors.InvalidArgumentError(`A ${kind} media stream is already running in this session`);
  }

  // No await between the check above and the registration below, or concurrent starts could both pass
  const stream = new MediaStream(source, opts, {
    emit: (event) => {
      if (hasSubscribers(this, event.method)) {
        this.eventEmitter.emit(BIDI_EVENT_NAME, event);
      }
    },
    emitter: this.eventEmitter,
    hasSubscribers: () => hasSubscribers(this, MEDIA_UNITS_EVENT),
    log: this.log,
    // Ended streams stay registered so that a later stop call is a no-op
    onEnded: () => {},
  });
  streams.set(stream.streamId, stream);
  try {
    return await stream.start();
  } catch (e) {
    streams.delete(stream.streamId);
    await stream.stop('failed to start');
    throw e instanceof TypeError || e instanceof RangeError ? new errors.InvalidArgumentError(e.message) : e;
  }
}

/** Stops a media stream started by `mobile: startMediaStream`. Stopping an ended stream is a no-op. */
export async function mobileStopMediaStream(this: XCUITestDriver, streamId: string): Promise<void> {
  const stream = this._mediaStreams?.get(streamId);
  if (!stream) {
    throw new errors.InvalidArgumentError(`Unknown media stream id '${streamId}'`);
  }
  await stream.stop();
}

/** Reports whether media streaming works for the current session, and which kinds/codecs it offers. */
export async function mobileGetMediaStreamCapabilities(this: XCUITestDriver): Promise<MediaStreamCapabilities> {
  return await getCapabilities(this);
}

async function getCapabilities(driver: XCUITestDriver): Promise<MediaStreamCapabilities> {
  if (!driver.isSimulator()) {
    return await getDeviceCapabilities(driver);
  }
  const base = {
    source: 'simulator' as const,
    kinds: ['video', 'jpeg'] as MediaKind[],
    codecs: ['h264', 'hevc'] as VideoCodec[],
    audio: true,
  };
  const major = driver.xcodeVersion?.major;
  if (major !== undefined && major < MIN_SIMULATOR_XCODE_MAJOR) {
    return unsupported(base.source, {
      code: 'xcode_too_old',
      message: `Simulator media streaming requires Xcode ${MIN_SIMULATOR_XCODE_MAJOR}+, found ${major}`,
    });
  }
  return {...base, supported: true};
}

async function getDeviceCapabilities(driver: XCUITestDriver): Promise<MediaStreamCapabilities> {
  const source = 'device' as const;
  if (!supportsApiLevel27(driver.opts.platformVersion)) {
    return unsupported(source, {
      code: 'os_too_old',
      message: `Real device media streaming requires iOS/tvOS 27+, found ${driver.opts.platformVersion}`,
    });
  }
  if (!(await driver.remoteXPCFacade.isTunnelTier())) {
    return unsupported(source, {
      code: 'tunnel_required',
      message: 'Real device media streaming requires a RemoteXPC tunnel',
    });
  }
  let noH264: string | undefined;
  try {
    noH264 = describeMissingH264Encoder(await loadMediaProxy());
  } catch (e) {
    return unsupported(source, {code: 'media_proxy_unavailable', message: (e as Error).message});
  }
  if (noH264) {
    // Still usable as JPEG; the reason says what H.264 (and the audio that rides on it) needs
    return {
      supported: true,
      source,
      kinds: ['jpeg'],
      codecs: [],
      audio: false,
      reason: {code: 'h264_encoder_unavailable', message: noH264},
    };
  }
  // media-proxy encodes H.264 only; the device's AAC-ELD audio is transcoded to AAC-LC
  return {supported: true, source, kinds: ['video', 'jpeg'], codecs: ['h264'], audio: true};
}

function unsupported(
  source: MediaStreamCapabilities['source'],
  reason: NonNullable<MediaStreamCapabilities['reason']>,
): MediaStreamCapabilities {
  return {supported: false, reason, source, kinds: [], codecs: [], audio: false};
}

/** Stops all streams of the session; used on session deletion. */
export async function stopAllMediaStreams(this: XCUITestDriver): Promise<void> {
  await Promise.all([...(this._mediaStreams?.values() ?? [])].map((s) => s.stop('session ended')));
  this._mediaStreams = undefined;
}

function hasSubscribers(driver: XCUITestDriver, method: string): boolean {
  return [method, MEDIA_STREAM_MODULE].some((e) => (driver.bidiEventSubs[e]?.length ?? 0) > 0);
}

function validateOpts({
  kind,
  codec,
  bitrate,
  quality,
  scale,
  audio,
  batchMs,
  idleHeartbeatMs,
}: StartMediaStreamOpts): void {
  if (kind !== 'video' && kind !== 'jpeg') {
    throw new errors.InvalidArgumentError(`'kind' must be either 'video' or 'jpeg', got '${String(kind)}'`);
  }
  const wrongKind = kind === 'video' ? {quality, scale} : {codec, bitrate, audio};
  const offending = Object.entries(wrongKind).filter(([, v]) => v !== undefined);
  if (offending.length) {
    throw new errors.InvalidArgumentError(
      `${offending.map(([k]) => `'${k}'`).join(', ')} not supported for kind '${kind}'`,
    );
  }
  if (!Number.isInteger(batchMs) || batchMs < 0 || !Number.isInteger(idleHeartbeatMs) || idleHeartbeatMs < 0) {
    throw new errors.InvalidArgumentError(`'batchMs' and 'idleHeartbeatMs' must be non-negative integers`);
  }
}
