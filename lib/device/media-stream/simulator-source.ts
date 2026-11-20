import type {Simulator} from 'appium-ios-simulator';

type VideoStream = Awaited<ReturnType<Simulator['startVideoStream']>>;
type JpegStream = Awaited<ReturnType<Simulator['startJpegStream']>>;

import type {MediaSource, SourceUnit, StartMediaStreamOpts} from './types.js';

/** coresim encodes at the source (VideoToolbox / JPEG), so there is nothing to transcode. */
export class SimulatorMediaSource implements MediaSource {
  private stream?: {video: VideoStream} | {jpeg: JpegStream};
  private starting?: Promise<void>;
  private stopping?: Promise<void>;

  constructor(
    private readonly sim: Simulator,
    private readonly opts: StartMediaStreamOpts,
  ) {}

  async start(): Promise<void> {
    this.starting = this.open();
    await this.starting;
  }

  private async open(): Promise<void> {
    const {opts, sim} = this;
    const common = {fps: opts.fps, displayId: opts.displayId};
    const stream =
      opts.kind === 'video'
        ? await sim.startVideoStream({...common, codec: opts.codec, bitrate: opts.bitrate, audio: opts.audio})
        : await sim.startJpegStream({...common, quality: opts.quality, scale: opts.scale});
    this.stream = opts.kind === 'video' ? {video: stream as VideoStream} : {jpeg: stream as JpegStream};
  }

  async *units(): AsyncGenerator<SourceUnit> {
    const {stream} = this;
    if (!stream) {
      throw new Error('The source has not been started');
    }
    if ('video' in stream) {
      yield* stream.video.accessUnits();
      return;
    }
    for await (const f of stream.jpeg.frames()) {
      yield {track: 'jpeg', data: f.data, isKeyFrame: true, sequence: f.sequence, timestampMicros: f.timestampMicros};
    }
  }

  async stop(): Promise<void> {
    // A stop that arrives while start() is pending must not miss the stream it creates
    await this.starting?.catch(() => {});
    const {stream} = this;
    this.stopping ??= stream ? ('video' in stream ? stream.video : stream.jpeg).stop() : Promise.resolve();
    await this.stopping;
  }
}
