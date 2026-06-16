import {HOST, PORT} from '../../helpers/session';

function webServerBaseUrl(): string {
  const baseUrl = process.env.TEST_WEB_SERVER_BASE_URL;
  if (!baseUrl) {
    throw new Error('Guinea pig server not started');
  }
  return baseUrl;
}

function defineLazyUrl(name: string, pathSuffix: string): void {
  Object.defineProperty(exports, name, {
    enumerable: true,
    get(): string {
      return `${webServerBaseUrl()}${pathSuffix}`;
    },
  });
}

export declare const GUINEA_PIG_PAGE: string;
export declare const GUINEA_PIG_SCROLLABLE_PAGE: string;
export declare const GUINEA_PIG_APP_BANNER_PAGE: string;
export declare const GUINEA_PIG_FRAME_PAGE: string;
export declare const GUINEA_PIG_IFRAME_PAGE: string;

defineLazyUrl('GUINEA_PIG_PAGE', '/test/guinea-pig');
defineLazyUrl('GUINEA_PIG_SCROLLABLE_PAGE', '/test/guinea-pig-scrollable');
defineLazyUrl('GUINEA_PIG_APP_BANNER_PAGE', '/test/guinea-pig-app-banner');
defineLazyUrl('GUINEA_PIG_FRAME_PAGE', '/test/frameset.html');
defineLazyUrl('GUINEA_PIG_IFRAME_PAGE', '/test/iframes.html');

// if the phishing URL stops working for some reason, see
// http://testsafebrowsing.appspot.com/ for alternatives
export const PHISHING_END_POINT = 'http://testsafebrowsing.appspot.com/s/phishing.html';
export const APPIUM_IMAGE = `http://${HOST}:${PORT}/appium.png`;
