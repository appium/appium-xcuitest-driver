import {randomUUID} from 'node:crypto';
import type {EventEmitter} from 'node:events';

import type {AppiumLogger, BiDiBackpressureEvent, BiDiEvent} from '@appium/types';

import {NATIVE_WIN} from '../../commands/constants.js';
import {UnitBatcher} from './batcher.js';
import {
  BACKPRESSURE_EVENT_NAME,
  FIRST_UNIT_TIMEOUT_MS,
  KEYFRAME_AGE_CHECK_MS,
  KEYFRAME_REQUEST_MIN_INTERVAL_MS,
  MEDIA_ENDED_EVENT,
  MEDIA_FORMAT_CHANGED_EVENT,
  MEDIA_STARTED_EVENT,
  MEDIA_STREAM_MODULE,
  MEDIA_UNITS_EVENT,
  SOURCE_START_TIMEOUT_MS,
  SOURCE_STOP_TIMEOUT_MS,
} from './constants.js';
import {readJpegSize} from './jpeg.js';
import {parseVideoSize} from './sps.js';
import type {MediaSource, MediaStreamInfo, MediaUnit, SourceUnit, StartMediaStreamOpts, WireUnit} from './types.js';

export interface MediaStreamDeps {
  emit: (event: BiDiEvent) => void;
  emitter: EventEmitter;
  hasSubscribers: () => boolean;
  log: AppiumLogger;
  /** Called once the stream is torn down, so the owner can release it */
  onEnded: (streamId: string) => void;
}

/**
 * Owns one media source and republishes its units as `appium:mediaStream.*` BiDi events
 * (droppable hints, late joiners start at a keyframe). The source is a simulator or a device.
 */
export class MediaStream {
  readonly streamId = randomUUID();
  readonly kind: StartMediaStreamOpts['kind'];

  private readonly batcher: UnitBatcher;
  private videoSynced = false;
  private wasSubscribed = false;
  private lastKeyFrameRequestAt = 0;
  private keyFrameRetry?: NodeJS.Timeout;
  private jpegSeq = 0;
  private lastJpeg?: MediaUnit;
  private lastJpegEmitAt = 0;
  private size?: {width: number; height: number};
  private audioFormat?: {sampleRate: number; channels: number};
  private dropped = 0;
  private heartbeat?: NodeJS.Timeout;
  private keyFrameTimer?: NodeJS.Timeout;
  private lastKeyFrameSentAt = 0;
  private pump?: Promise<void>;
  private announced = false;
  private endReason = 'ended';
  private firstUnitSeen!: () => void;
  private readonly firstUnit = new Promise<void>((resolve) => (this.firstUnitSeen = resolve));
  private stopped = false;
  private sourceStopped?: Promise<void>;
  private get videoChain(): string {
    return `${this.streamId}:video`;
  }

  constructor(
    private readonly source: MediaSource,
    private readonly opts: StartMediaStreamOpts,
    private readonly deps: MediaStreamDeps,
  ) {
    this.kind = opts.kind;
    this.batcher = new UnitBatcher(opts.kind === 'jpeg' ? 0 : opts.batchMs, (units) => this.emitUnits(units));
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  async start(): Promise<MediaStreamInfo> {
    const {opts} = this;
    if (this.stopped) {
      throw new Error('The stream was stopped before it started');
    }
    try {
      await withTimeout(this.source.start(), SOURCE_START_TIMEOUT_MS, `The ${this.kind} source did not start`);
    } catch (e) {
      await this.stopSource();
      throw e;
    }
    if (this.stopped) {
      await this.stopSource();
      throw new Error('The stream was stopped while it was starting');
    }

    this.deps.emitter.on(BACKPRESSURE_EVENT_NAME, this.onBackpressure);
    if (opts.kind === 'jpeg' && opts.idleHeartbeatMs > 0) {
      this.heartbeat = setInterval(() => this.replayLastJpeg(), opts.idleHeartbeatMs);
    }
    this.pump = this.runPump();
    if (opts.kind === 'jpeg') {
      // A static screen yields no frames, so there is nothing to wait for
      this.announce();
    } else {
      await this.waitForFirstUnit(this.pump);
      this.watchKeyFrameAge();
    }
    return this.info();
  }

  // Opt-in. The encoder may send keyframes rarely, and nothing at all on a static screen, which is not
  // enough for a client that cuts the stream into segments or lets viewers join at any time
  private watchKeyFrameAge(): void {
    const intervalMs = this.opts.keyFrameIntervalMs;
    if (!intervalMs || this.stopped) {
      return;
    }
    // Without a subscriber nobody would get the keyframe, so the encoder is left alone
    const dueInMs = this.deps.hasSubscribers() ? this.lastKeyFrameSentAt + intervalMs - Date.now() : undefined;
    if (dueInMs !== undefined && dueInMs <= 0) {
      this.requestKeyFrame();
    }
    // Looks again when the next keyframe is due, or shortly if one was just requested or nobody is subscribed
    this.keyFrameTimer = setTimeout(
      () => this.watchKeyFrameAge(),
      dueInMs !== undefined && dueInMs > 0 ? dueInMs : KEYFRAME_AGE_CHECK_MS,
    );
  }

  /** Idempotent; resolves once the stream is torn down and its pump has finished. */
  async stop(reason = 'stopped'): Promise<void> {
    await this.finish(reason);
    if (this.pump) {
      // A source that never ends its units must not hang the caller (and the session teardown)
      await withTimeout(this.pump, SOURCE_STOP_TIMEOUT_MS, 'The stream pump did not end').catch(() => {});
    }
  }

  // The wait is bounded so a hung source cannot block the caller, but `sourceStopped` tracks the real stop
  private async stopSource(): Promise<void> {
    this.sourceStopped ??= this.runSourceStop();
    try {
      await withTimeout(this.sourceStopped, SOURCE_STOP_TIMEOUT_MS, `The ${this.kind} source did not stop`);
    } catch (e) {
      this.deps.log.warn(`Cannot stop the ${this.kind} stream source: ${(e as Error).message}`);
    }
  }

  private async runSourceStop(): Promise<void> {
    try {
      await this.source.stop();
    } catch (e) {
      this.deps.log.warn(`Cannot stop the ${this.kind} stream source: ${(e as Error).message}`);
    }
  }

  // Fails fast if the source never produces anything or ends right away
  private async waitForFirstUnit(pump: Promise<void>): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.firstUnit,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`The ${this.kind} stream produced no output within ${FIRST_UNIT_TIMEOUT_MS}ms`)),
            FIRST_UNIT_TIMEOUT_MS,
          );
        }),
        pump.then(() => {
          throw new Error(`The ${this.kind} stream ended before producing any output (${this.endReason})`);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private announce(): void {
    if (this.announced || this.stopped) {
      return;
    }
    this.announced = true;
    this.send({method: MEDIA_STARTED_EVENT, params: {...this.info()}});
  }

  // Must not await the pump: it is also called from inside the pump itself
  private async finish(reason: string): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    clearInterval(this.heartbeat);
    clearTimeout(this.keyFrameTimer);
    this.cancelKeyFrameRetry();
    // Units already received are still valid, so they go out before `ended`
    this.batcher.flush();
    this.batcher.close();
    this.lastJpeg = undefined;
    this.deps.emitter.off(BACKPRESSURE_EVENT_NAME, this.onBackpressure);
    await this.stopSource();
    if (this.announced) {
      this.send({method: MEDIA_ENDED_EVENT, params: {streamId: this.streamId, reason}});
    }
    // A source that is still stopping may stop the whole device later, so keep the stream owned until then
    void this.releaseOnceStopped();
  }

  private async releaseOnceStopped(): Promise<void> {
    await this.sourceStopped;
    this.deps.onEnded(this.streamId);
  }

  info(): MediaStreamInfo {
    const {opts} = this;
    const isVideo = opts.kind === 'video';
    return {
      streamId: this.streamId,
      kind: opts.kind,
      tracks: isVideo ? (opts.audio ? ['video', 'audio'] : ['video']) : ['jpeg'],
      codec: isVideo ? (opts.codec ?? 'h264') : 'jpeg',
      event: MEDIA_STREAM_MODULE,
      ...this.size,
      ...(this.audioFormat ? {audio: this.audioFormat} : {}),
    };
  }

  private async runPump(): Promise<void> {
    let reason = 'ended';
    try {
      for await (const u of this.source.units()) {
        if (u.track === 'jpeg') {
          this.onJpegFrame(u);
        } else {
          this.onAccessUnit(u);
        }
      }
    } catch (e) {
      reason = `error: ${(e as Error).message}`;
    }
    this.endReason = reason;
    await this.finish(reason);
  }

  private onAccessUnit(au: SourceUnit): void {
    if (this.stopped) {
      return;
    }
    if (au.track === 'audio') {
      this.audioFormat ??= parseAdtsFormat(au.data);
      if (!this.announced) {
        // `started` must carry the video size, which comes with the first keyframe
        return;
      }
    } else if (au.isKeyFrame) {
      this.checkVideoSize(au.data);
    } else if (!this.announced) {
      // `started` carries the size, which only a keyframe has, and a delta frame is not decodable alone
      return;
    }
    this.announce();
    this.firstUnitSeen();

    const subscribed = this.deps.hasSubscribers();
    if (subscribed && !this.wasSubscribed && !(au.track === 'video' && au.isKeyFrame)) {
      // Late joiner: keyframes can be rare on a slowly changing screen, so ask for one. Only a video
      // keyframe satisfies the late joiner. An audio unit is always marked as a keyframe and usually
      // arrives first, so it must not
      this.requestKeyFrame();
    }
    this.wasSubscribed = subscribed;
    if (!subscribed) {
      this.videoSynced = false;
      return;
    }
    if (au.track === 'video') {
      if (au.isKeyFrame) {
        this.videoSynced = true;
        this.lastKeyFrameSentAt = Date.now();
        // The subscribers get a keyframe now, so a request still waiting for the rate limit is not needed
        this.cancelKeyFrameRetry();
      } else if (!this.videoSynced) {
        return;
      }
    }
    this.batcher.push({
      track: au.track,
      seq: au.sequence,
      ts: au.timestampMicros,
      key: au.track === 'audio' ? true : au.isKeyFrame,
      data: au.data,
    });
  }

  // The first keyframe sets the size announced in `started`; a later change is a new format (rotation)
  private checkVideoSize(keyFrame: Buffer): void {
    const size = parseVideoSize(keyFrame, this.opts.codec ?? 'h264');
    if (!size || (size.width === this.size?.width && size.height === this.size?.height)) {
      return;
    }
    const isFirst = !this.size;
    this.size = size;
    if (!isFirst) {
      // Units of the previous format must reach clients before the new format is announced
      this.batcher.flush();
      this.send({method: MEDIA_FORMAT_CHANGED_EVENT, params: {streamId: this.streamId, ...size}});
    }
  }

  private onJpegFrame(frame: SourceUnit): void {
    if (this.stopped) {
      return;
    }
    const unit: MediaUnit = {
      track: 'jpeg',
      seq: this.jpegSeq++,
      ts: frame.timestampMicros,
      key: true,
      data: frame.data,
    };
    this.lastJpeg = unit;
    this.checkJpegSize(frame.data);
    this.firstUnitSeen();
    if (this.deps.hasSubscribers()) {
      this.lastJpegEmitAt = Date.now();
      this.batcher.push(unit);
    }
  }

  private replayLastJpeg(): void {
    if (
      this.stopped ||
      !this.lastJpeg ||
      Date.now() - this.lastJpegEmitAt < this.opts.idleHeartbeatMs ||
      !this.deps.hasSubscribers()
    ) {
      return;
    }
    this.lastJpegEmitAt = Date.now();
    this.batcher.push({...this.lastJpeg, seq: this.jpegSeq++});
  }

  private checkJpegSize(jpeg: Buffer): void {
    const size = readJpegSize(jpeg);
    if (!size || (size.width === this.size?.width && size.height === this.size?.height)) {
      return;
    }
    this.size = size;
    this.send({method: MEDIA_FORMAT_CHANGED_EVENT, params: {streamId: this.streamId, ...size}});
  }

  private emitUnits(units: MediaUnit[]): void {
    const [first] = units;
    const delivery: BiDiEvent['delivery'] =
      first.track === 'audio'
        ? {policy: 'reliable'}
        : first.track === 'jpeg'
          ? {policy: 'droppable'}
          : {policy: 'droppable', chain: this.videoChain, syncPoint: first.key};
    const dropped = this.dropped;
    this.dropped = 0;
    this.send({
      method: MEDIA_UNITS_EVENT,
      params: {streamId: this.streamId, units: units.map(toWireUnit), dropped},
      delivery,
    });
  }

  // Every media event belongs to the native context, like the other custom events
  private send(event: BiDiEvent): void {
    this.deps.emit({context: NATIVE_WIN, ...event});
  }

  // At most one request per interval. A request that comes sooner is sent once the interval has passed,
  // unless a keyframe reaches the subscribers first
  private requestKeyFrame(): void {
    if (this.stopped || this.kind !== 'video' || !this.source.requestKeyFrame) {
      return;
    }
    const wait = this.lastKeyFrameRequestAt + KEYFRAME_REQUEST_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) {
      this.keyFrameRetry ??= setTimeout(() => {
        this.keyFrameRetry = undefined;
        if (this.deps.hasSubscribers()) {
          this.requestKeyFrame();
        }
      }, wait);
      return;
    }
    this.cancelKeyFrameRetry();
    this.lastKeyFrameRequestAt = Date.now();
    void this.sendKeyFrameRequest();
  }

  private cancelKeyFrameRetry(): void {
    clearTimeout(this.keyFrameRetry);
    this.keyFrameRetry = undefined;
  }

  private async sendKeyFrameRequest(): Promise<void> {
    try {
      const sent = await this.source.requestKeyFrame?.();
      this.deps.log.debug(`Keyframe request for stream ${this.streamId}: ${sent ? 'sent' : 'unsupported'}`);
    } catch (e) {
      this.deps.log.debug(`Keyframe request for stream ${this.streamId} failed: ${(e as Error).message}`);
    }
  }

  private onBackpressure = (ev: BiDiBackpressureEvent): void => {
    // The shared emitter reports all streams: video drops carry its chain, JPEG ones have none
    if (ev.method !== MEDIA_UNITS_EVENT || ev.chain !== (this.kind === 'video' ? this.videoChain : undefined)) {
      return;
    }
    // Core skips the video chain until a sync point; get one without waiting for the GOP
    this.requestKeyFrame();
    this.dropped = Math.max(this.dropped, ev.dropped);
    this.deps.log.debug(`BiDi backpressure for stream ${this.streamId}: ${ev.state} (dropped=${ev.dropped})`);
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${message} within ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function toWireUnit(u: MediaUnit): WireUnit {
  return {track: u.track, seq: u.seq, ts: u.ts, key: u.key, data: u.data.toString('base64')};
}

const ADTS_SAMPLE_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** Reads sample rate and channel count from an ADTS header; undefined if it is not one */
export function parseAdtsFormat(adts: Buffer): {sampleRate: number; channels: number} | undefined {
  if (adts.length < 7 || adts[0] !== 0xff || (adts[1] & 0xf0) !== 0xf0) {
    return undefined;
  }
  const sampleRate = ADTS_SAMPLE_RATES[(adts[2] >> 2) & 0xf];
  const channels = ((adts[2] & 1) << 2) | (adts[3] >> 6);
  return sampleRate && channels ? {sampleRate, channels} : undefined;
}
