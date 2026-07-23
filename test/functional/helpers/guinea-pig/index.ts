import {startGuineaPigServer, type GuineaPigServer} from './server.js';

export type GuineaPigServerSession = {
  setup: () => Promise<GuineaPigServer>;
  teardown: () => Promise<void>;
};

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

export function createGuineaPigServerSession(): GuineaPigServerSession {
  let server: GuineaPigServer | undefined;

  return {
    setup: async () => {
      if (!server) {
        server = await startGuineaPigServer();
      }
      return server;
    },
    teardown: async () => {
      if (server) {
        await server.close();
        server = undefined;
      }
    },
  };
}
