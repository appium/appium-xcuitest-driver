import type * as MediaProxy from '@appium/media-proxy';

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
