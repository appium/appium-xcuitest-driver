export type MediaKind = 'video' | 'jpeg';
export type MediaTrack = 'video' | 'audio' | 'jpeg';
export type VideoCodec = 'h264' | 'hevc';

/** A contract unit; video config is inline on keyframes. */
export interface MediaUnit {
  track: MediaTrack;
  seq: number;
  ts: number;
  key: boolean;
  data: Buffer;
}

/** The JSON shape of a unit inside `appium:mediaStream.units` */
export interface WireUnit extends Omit<MediaUnit, 'data'> {
  data: string;
}

export interface StartMediaStreamOpts {
  kind: MediaKind;
  codec?: VideoCodec;
  fps?: number;
  bitrate?: number;
  quality?: number;
  scale?: number;
  audio?: boolean;
  /** Simulator display id; the primary display by default */
  displayId?: string;
  /** Batching window for video/audio units; JPEG is never batched */
  batchMs: number;
  /** Re-emit the last JPEG after this much idle time (0 disables) */
  idleHeartbeatMs: number;
}

export interface MediaStreamInfo {
  streamId: string;
  kind: MediaKind;
  tracks: MediaTrack[];
  codec: VideoCodec | 'jpeg';
  event: string;
  width?: number;
  height?: number;
  audio?: {sampleRate: number; channels: number};
}

export interface MediaStreamCapabilities {
  supported: boolean;
  reason?: {
    code: 'xcode_too_old' | 'os_too_old' | 'tunnel_required' | 'media_proxy_unavailable' | 'h264_encoder_unavailable';
    message: string;
  };
  source: 'simulator' | 'device';
  kinds: MediaKind[];
  codecs: VideoCodec[];
  audio: boolean;
}

/** One unit as produced by a source (coresim, or media-proxy fed by remotexpc) */
export interface SourceUnit {
  track: MediaTrack;
  data: Buffer;
  isKeyFrame: boolean;
  sequence: number;
  timestampMicros: number;
}

/** Where the units come from; the stream adapter does not care whether it is a simulator or a device */
export interface MediaSource {
  /** Resolves once the capture runs */
  start(): Promise<void>;
  units(): AsyncIterable<SourceUnit>;
  /** Asks the encoder for a keyframe; false if the source cannot */
  requestKeyFrame?(): Promise<boolean>;
  /** Idempotent */
  stop(): Promise<void>;
}
