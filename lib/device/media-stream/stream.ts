import {randomUUID} from 'node:crypto';
import type {EventEmitter} from 'node:events';

import type {AppiumLogger, BiDiBackpressureEvent, BiDiEvent} from '@appium/types';

import {NATIVE_WIN} from '../../commands/constants.js';
import {UnitBatcher} from './batcher.js';
import {
  BACKPRESSURE_EVENT_NAME,
  FIRST_UNIT_TIMEOUT_MS,
  KEYFRAME_REQUEST_MIN_INTERVAL_MS,
  MEDIA_ENDED_EVENT,
  MEDIA_FORMAT_CHANGED_EVENT,
  MEDIA_STARTED_EVENT,
  MEDIA_STREAM_MODULE,
  MEDIA_UNITS_EVENT,
} from './constants.js';
import {readJpegSize} from './jpeg.js';
import {parseVideoSize} from './sps.js';
import type {MediaSource, MediaStreamInfo, MediaUnit, SourceUnit, StartMediaStreamOpts, WireUnit} from './types.js';

export interface MediaStreamDeps {
  emit: (event: BiDiEvent) => void;
  emitter: EventEmitter;
  hasSubscribers: () => boolean;
  log: AppiumLogger;
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
  private jpegSeq = 0;
  private lastJpeg?: MediaUnit;
  private lastJpegEmitAt = 0;
  private size?: {width: number; height: number};
  private audioFormat?: {sampleRate: number; channels: number};
  private dropped = 0;
  private heartbeat?: NodeJS.Timeout;
  private pump?: Promise<void>;
  private announced = false;
  private endReason = 'ended';
  private firstUnitSeen!: () => void;
  private readonly firstUnit = new Promise<void>((resolve) => (this.firstUnitSeen = resolve));
  private stopped = false;
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
      await this.source.start();
    } catch (e) {
      await this.source.stop().catch(() => {});
      throw e;
    }
    if (this.stopped) {
      await this.source.stop().catch(() => {});
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
    }
    return this.info();
  }

  /** Idempotent; resolves once the stream is torn down and its pump has finished. */
  async stop(reason = 'stopped'): Promise<void> {
    await this.finish(reason);
    await this.pump?.catch(() => {});
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
    this.batcher.close();
    this.lastJpeg = undefined;
    this.deps.emitter.off(BACKPRESSURE_EVENT_NAME, this.onBackpressure);
    try {
      await this.source.stop();
    } catch (e) {
      this.deps.log.warn(`Cannot stop the ${this.kind} stream source: ${(e as Error).message}`);
    }
    if (this.announced) {
      this.send({method: MEDIA_ENDED_EVENT, params: {streamId: this.streamId, reason}});
    }
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
    // Units already batched are still valid; finish() drops whatever is pending
    if (!this.stopped) {
      this.batcher.flush();
    }
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
    }
    this.announce();
    this.firstUnitSeen();

    const subscribed = this.deps.hasSubscribers();
    if (subscribed && !this.wasSubscribed && !au.isKeyFrame) {
      // Late joiner: keyframes can be rare on a slowly changing screen, so ask for one
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

  private requestKeyFrame(): void {
    const now = Date.now();
    if (
      this.kind !== 'video' ||
      !this.source.requestKeyFrame ||
      now - this.lastKeyFrameRequestAt < KEYFRAME_REQUEST_MIN_INTERVAL_MS
    ) {
      return;
    }
    this.lastKeyFrameRequestAt = now;
    void this.sendKeyFrameRequest();
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
