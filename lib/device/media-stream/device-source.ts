import type {VideoAccessUnit} from '@appium/media-proxy';
import type {AppiumLogger} from '@appium/types';

import type {RemoteXPCFacade} from '../remote-xpc/facade.js';
import {loadRemoteXPCModule} from '../remote-xpc/module-loader.js';
import {explainEncoderError, loadMediaProxy, type MediaProxyModule} from './media-proxy.js';
import {parseDisplayGeometry, type DisplayGeometry, type Rotation} from './orientation.js';
import type {MediaSource, SourceUnit, StartMediaStreamOpts} from './types.js';

type Transcoder = ReturnType<MediaProxyModule['createTranscoder']>;
type AccessUnit = Parameters<Transcoder['push']>[0];
type Capture = {
  accessUnits(): AsyncIterable<AccessUnit>;
  stop(): Promise<void>;
  requestKeyFrame(): Promise<boolean>;
};
type AudioCapture = {
  accessUnits(): AsyncIterable<Parameters<Transcoder['pushAudio']>[0]>;
  stop(): Promise<void>;
};
type Display = {
  close(): Promise<void>;
  isStreamingSupported(): Promise<boolean>;
};

type InfoService = {getDisplayInfo(): Promise<unknown>; close?(): Promise<void> | void};

/** How often the display's orientation is read; a rotation shows up within this time (plus its animation) */
const ORIENTATION_POLL_MS = 1000;

/** The device sends one IDR and its picture drifts after large screen changes, so remotexpc asks for new ones */
const KEYFRAME_INTERVAL_MS = 2000;

/** The device's video RTP clock (400 ticks per frame at 60 fps), not the 90 kHz of RFC 7798 */
const VIDEO_CLOCK_RATE = 24_000;

/**
 * Real device (iOS/tvOS 27+): remotexpc captures the HEVC screen stream over the tunnel and
 * media-proxy transcodes it to H.264 or MJPEG.
 */
export class DeviceMediaSource implements MediaSource {
  private display?: Display;
  private capture?: Capture;
  private audioCapture?: AudioCapture;
  private audioFeeder?: Promise<void>;
  private transcoder?: Transcoder;
  private feeder?: Promise<void>;
  private orientationTimer?: NodeJS.Timeout;
  private infoService?: InfoService;
  private rotation: Rotation = 0;
  private polling = false;
  private failure?: Error;
  private starting?: Promise<void>;
  private stopping?: Promise<void>;

  constructor(
    private readonly facade: RemoteXPCFacade,
    private readonly opts: StartMediaStreamOpts,
    private readonly log: AppiumLogger,
  ) {}

  async start(): Promise<void> {
    this.starting = this.open();
    await this.starting;
  }

  private async open(): Promise<void> {
    const {opts} = this;
    const mediaProxy = await loadMediaProxy();
    const {ScreenStreamCapture, AudioStreamCapture, XPCUUID, AAC_ELD_FORMAT} = await loadRemoteXPCModule();
    const withAudio = opts.kind === 'video' && Boolean(opts.audio);
    const displayId = opts.displayId === undefined ? undefined : Number(opts.displayId);
    const geometry = await this.readGeometry(displayId);
    const input = {
      videoClockRate: VIDEO_CLOCK_RATE,
      // Without the size the padding stays; without the orientation a landscape UI stays turned
      ...(geometry && isEven(geometry.width) && isEven(geometry.height)
        ? {crop: {width: geometry.width, height: geometry.height}}
        : {}),
      rotation: geometry?.rotation ?? 0,
    };
    this.rotation = input.rotation;
    // Fails here, before the device starts streaming, if the addon or an encoder is missing
    let transcoder: Transcoder;
    try {
      transcoder =
        opts.kind === 'video'
          ? mediaProxy.createTranscoder({
              codec: 'h264',
              fps: opts.fps,
              bitrate: opts.bitrate,
              ...(withAudio ? {audio: true, audioSpecificConfig: AAC_ELD_FORMAT.audioSpecificConfig} : {}),
              ...input,
            })
          : mediaProxy.createTranscoder({
              codec: 'mjpeg',
              fps: opts.fps,
              quality: opts.quality,
              scale: opts.scale,
              ...input,
            });
    } catch (e) {
      throw explainEncoderError(e);
    }
    this.transcoder = transcoder;
    try {
      const display = (await this.facade.requireTunnelService('media streaming', (services) =>
        services.startDisplayService(this.facade.udid),
      )) as unknown as Display;
      this.display = display;
      if (!(await display.isStreamingSupported())) {
        throw new Error('The device does not support media streaming (requires iOS/tvOS 27+)');
      }
      // One session id pairs the video and audio streams, as Xcode's mirror does
      const clientSessionId = withAudio ? XPCUUID.random() : undefined;
      this.capture = (await ScreenStreamCapture.start(display as never, {
        displayId,
        keyFrameIntervalMs: KEYFRAME_INTERVAL_MS,
        ...(clientSessionId ? {clientSessionId} : {}),
      })) as unknown as Capture;
      if (clientSessionId) {
        this.audioCapture = (await AudioStreamCapture.start(display as never, {
          clientSessionId,
        })) as unknown as AudioCapture;
      }
      this.orientationTimer = setInterval(() => void this.pollOrientation(displayId), ORIENTATION_POLL_MS);
    } catch (e) {
      await this.teardown();
      throw e;
    }
    this.feeder = this.feed(this.capture, transcoder);
    if (this.audioCapture) {
      this.audioFeeder = this.feedAudio(this.audioCapture, transcoder);
    }
  }

  // Optional: a device that cannot report its display still streams, just without crop and rotation
  private async readGeometry(displayId?: number): Promise<DisplayGeometry | undefined> {
    try {
      const service = (await this.facade.requireTunnelService('media streaming', (services) =>
        services.startCoreDeviceInfoService(this.facade.udid),
      )) as unknown as InfoService;
      this.infoService = service;
      return parseDisplayGeometry(await service.getDisplayInfo(), displayId);
    } catch (e) {
      this.log.warn(`Cannot read the display geometry, the stream is not cropped or rotated: ${(e as Error).message}`);
      return undefined;
    }
  }

  private async pollOrientation(displayId?: number): Promise<void> {
    const {infoService, transcoder} = this;
    if (!infoService || !transcoder || this.polling) {
      return;
    }
    this.polling = true;
    try {
      const rotation = parseDisplayGeometry(await infoService.getDisplayInfo(), displayId)?.rotation;
      if (rotation !== undefined && rotation !== this.rotation) {
        this.log.debug(`The display rotated from ${this.rotation} to ${rotation} degrees`);
        this.rotation = rotation;
        transcoder.setRotation(rotation);
      }
    } catch (e) {
      this.log.debug(`Cannot read the display orientation: ${(e as Error).message}`);
    } finally {
      this.polling = false;
    }
  }

  async *units(): AsyncGenerator<SourceUnit> {
    const {transcoder} = this;
    if (!transcoder) {
      throw new Error('The source has not been started');
    }
    const isVideo = this.opts.kind === 'video';
    for await (const u of transcoder.units()) {
      const {data, sequence, timestampMicros} = u;
      yield isVideo
        ? {
            track: (u as VideoAccessUnit).track,
            data,
            isKeyFrame: (u as VideoAccessUnit).isKeyFrame,
            sequence,
            timestampMicros,
          }
        : {track: 'jpeg', data, isKeyFrame: true, sequence, timestampMicros};
    }
    if (this.failure) {
      throw this.failure;
    }
  }

  async requestKeyFrame(): Promise<boolean> {
    return (await this.capture?.requestKeyFrame()) ?? false;
  }

  async stop(): Promise<void> {
    // A stop that arrives while start() is pending must not miss what it creates
    await this.starting?.catch(() => {});
    await this.teardown();
  }

  private async teardown(): Promise<void> {
    this.stopping ??= (async () => {
      clearInterval(this.orientationTimer);
      // The capture's own stop() also tells the device to stop streaming
      await this.capture?.stop().catch((e: Error) => this.log.debug(`Cannot stop the capture: ${e.message}`));
      await this.audioCapture
        ?.stop()
        .catch((e: Error) => this.log.debug(`Cannot stop the audio capture: ${e.message}`));
      await this.transcoder?.close().catch((e: Error) => this.log.debug(`Cannot close the transcoder: ${e.message}`));
      await Promise.resolve(this.infoService?.close?.()).catch((e: Error) =>
        this.log.debug(`Cannot close the info service: ${e.message}`),
      );
      await this.display?.close().catch((e: Error) => this.log.debug(`Cannot close the display service: ${e.message}`));
      await this.feeder;
      await this.audioFeeder;
    })();
    await this.stopping;
  }

  private async feed(capture: Capture, transcoder: Transcoder): Promise<void> {
    try {
      for await (const au of capture.accessUnits()) {
        if (au.isKeyFrame) {
          // The device's IDR is a clean reference: start a new H.264 GOP from it
          transcoder.requestKeyFrame();
        }
        transcoder.push(au);
      }
      await transcoder.end();
    } catch (e) {
      this.failure = e as Error;
      await transcoder.close().catch(() => {});
    }
  }

  // Audio is best effort: a failing audio stream must not end the video
  private async feedAudio(capture: AudioCapture, transcoder: Transcoder): Promise<void> {
    try {
      for await (const au of capture.accessUnits()) {
        transcoder.pushAudio(au);
      }
    } catch (e) {
      this.log.warn(`The audio stream ended: ${(e as Error).message}`);
    }
  }
}

function isEven(value: number): boolean {
  return value % 2 === 0;
}
