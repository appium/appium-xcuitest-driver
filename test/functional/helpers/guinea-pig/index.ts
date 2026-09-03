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

export function guineaPigDragAndDropPage(baseUrl: string): string {
  return buildGuineaPigUrl(baseUrl, '/test/guinea-pig-drag-and-drop.html');
}

export function guineaPigFramePage(baseUrl: string): string {
  return buildGuineaPigUrl(baseUrl, '/test/frameset.html');
}

export function guineaPigIframePage(baseUrl: string): string {
  return buildGuineaPigUrl(baseUrl, '/test/iframes.html');
}

// Wraps the standard guinea pig page in a same-origin iframe.
export function guineaPigIframeWrapPage(baseUrl: string): string {
  return buildGuineaPigUrl(baseUrl, '/test/iframe-wrap.html');
}

// Same as guineaPigIframeWrapPage, nested one level deeper.
export function guineaPigNestedIframeWrapPage(baseUrl: string): string {
  return buildGuineaPigUrl(baseUrl, '/test/iframe-wrap-nested.html');
}

// Wraps the standard guinea pig page, served from crossOriginBaseUrl, in an iframe.
export function guineaPigCrossOriginIframeWrapPage(baseUrl: string, crossOriginBaseUrl: string): string {
  return `${buildGuineaPigUrl(baseUrl, '/test/iframe-wrap-cross-origin')}?crossOriginBaseUrl=${encodeURIComponent(crossOriginBaseUrl)}`;
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
