import type * as MediaProxy from '@appium/media-proxy';
import {errors} from 'appium/driver.js';

export type MediaProxyModule = typeof MediaProxy;

let cached: MediaProxyModule | undefined;

/**
 * Lazily imports the optional `@appium/media-proxy`, so that sessions not streaming a real device never load it.
 *
 * @throws When the package is not installed
 */
export async function loadMediaProxy(): Promise<MediaProxyModule> {
  try {
    cached ??= await import('@appium/media-proxy');
  } catch (e) {
    throw new Error(
      `Streaming a real device requires the optional '@appium/media-proxy' package: ${(e as Error).message}`,
      {cause: e},
    );
  }
  return cached;
}

const OPENH264_DOCS = 'https://github.com/appium/appium-ios/tree/main/packages/media-proxy#software-h264-openh264';
const OPENH264_HINT =
  `Request kind 'jpeg' (it needs no encoder), or install Cisco's OpenH264 2.6.0 (exactly this version) ` +
  `and set MEDIA_PROXY_OPENH264_PATH to the library. Download links and steps: ${OPENH264_DOCS}`;

/** Why H.264 can't be streamed here, or `undefined` if an encoder is available. */
export function describeMissingH264Encoder(mediaProxy: Pick<MediaProxyModule, 'getH264Encoders'>): string | undefined {
  return mediaProxy.getH264Encoders().length === 0 ? `No H.264 encoder is available. ${OPENH264_HINT}` : undefined;
}

/** Rewords media-proxy's "no H.264 encoder" error (written for its own options) for the driver's. */
export function explainEncoderError(e: unknown): unknown {
  const message = (e as Error | undefined)?.message;
  if (
    (e as Error | undefined)?.name !== 'MediaProxyEncoderUnavailableError' ||
    !message?.startsWith('No H.264 encoder')
  ) {
    return e;
  }
  return new errors.UnsupportedOperationError(`${message.split('. Use codec')[0]}. ${OPENH264_HINT}`);
}
