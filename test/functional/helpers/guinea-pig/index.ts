import {memoize} from '../../../../lib/utils';
import {startGuineaPigServer, type GuineaPigServer} from './server';

export function buildGuineaPigUrl(baseUrl: string, pathSuffix: string): string {
  return `${baseUrl}${pathSuffix}`;
}

export function guineaPigPage(baseUrl: string): string {
  return buildGuineaPigUrl(baseUrl, '/test/guinea-pig');
}

export function guineaPigScrollablePage(baseUrl: string): string {
  return buildGuineaPigUrl(baseUrl, '/test/guinea-pig-scrollable');
}

export function guineaPigAppBannerPage(baseUrl: string): string {
  return buildGuineaPigUrl(baseUrl, '/test/guinea-pig-app-banner');
}

export function guineaPigFramePage(baseUrl: string): string {
  return buildGuineaPigUrl(baseUrl, '/test/frameset.html');
}

export function guineaPigIframePage(baseUrl: string): string {
  return buildGuineaPigUrl(baseUrl, '/test/iframes.html');
}

export const ensureGuineaPigServer = memoize(
  async function ensureGuineaPigServer(): Promise<GuineaPigServer> {
    return await startGuineaPigServer();
  },
);

export async function setupGuineaPigServer(): Promise<GuineaPigServer> {
  return await ensureGuineaPigServer();
}

export async function teardownGuineaPigServer(): Promise<void> {
  const serverPromise = ensureGuineaPigServer.cache.get(undefined) as
    | Promise<GuineaPigServer>
    | undefined;
  if (serverPromise) {
    const server = await serverPromise;
    await server.close();
  }
  ensureGuineaPigServer.cache.clear();
}
