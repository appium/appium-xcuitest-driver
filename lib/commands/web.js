import { iosCommands } from 'appium-ios-driver';
import { retryInterval } from 'asyncbox';
import { util } from 'appium-support';
import log from '../logger';
import _ from 'lodash';
import B from 'bluebird';


const IPHONE_EXTRA_WEB_COORD_SCROLL_OFFSET = -15;
const IPHONE_EXTRA_WEB_COORD_NON_SCROLL_OFFSET = 10;
const IPHONE_WEB_COORD_OFFSET = -10;
const IPHONE_WEB_COORD_SMART_APP_BANNER_OFFSET = 84;
const IPHONE_X_EXTRA_WEB_COORD_SCROLL_OFFSET = -90;
const IPHONE_X_EXTRA_WEB_COORD_NON_SCROLL_OFFSET = -10;
const IPHONE_X_WEB_COORD_OFFSET = 40;
const IPAD_EXTRA_WEB_COORD_SCROLL_OFFSET = -10;
const IPAD_EXTRA_WEB_COORD_NON_SCROLL_OFFSET = 0;
const IPAD_WEB_COORD_OFFSET = 10;
const IPAD_WEB_COORD_SMART_APP_BANNER_OFFSET = 95;

const IPHONE_X_WIDTH = 375;
const IPHONE_X_HEIGHT = 812;

const ATOM_WAIT_TIMEOUT = 5 * 60000;

let extensions = {};

Object.assign(extensions, iosCommands.web);



extensions.getSafariIsIphone = async function getSafariIsIphone () {
  try {
    const userAgent = await this.execute('return navigator.userAgent');
    return userAgent.toLowerCase().includes('iphone');
  } catch (err) {
    log.warn(`Unable to find device type from useragent. Assuming iPhone`);
    log.debug(`Error: ${err.message}`);
  }
  return true;
};

extensions.getSafariIsIphoneX = async function getSafariIsIphone () {
  try {
    const script = 'return {height: window.screen.availHeight, width: window.screen.availWidth};';
    const {height, width} = await this.execute(script);
    // check for the correct height and width
    return (height === IPHONE_X_HEIGHT && width === IPHONE_X_WIDTH) ||
           (height === IPHONE_X_WIDTH && width === IPHONE_X_HEIGHT);
  } catch (err) {
    log.warn(`Unable to find device type from useragent. Assuming not iPhone X`);
    log.debug(`Error: ${err.message}`);
  }
  return false;
};

const getElementHeightMemoized = _.memoize(async function (key, driver, el) {
  el = util.unwrapElement(el);
  return (await driver.getNativeRect(el)).height;
});

extensions.getExtraTranslateWebCoordsOffset = async function (coords, webviewRect) {
  let offset = 0;

  // keep track of implicit wait, and set locally to 0
  const implicitWaitMs = this.implicitWaitMs;

  const isIphone = await this.getSafariIsIphone();
  const isIphoneX = isIphone && await this.getSafariIsIphoneX();

  try {
    this.setImplicitWait(0);

    // check if the full url bar is up
    await this.findNativeElementOrElements('accessibility id', 'ReloadButton', false);

    // reload button found, which means scrolling has not happened
    if (isIphoneX) {
      offset += IPHONE_X_EXTRA_WEB_COORD_NON_SCROLL_OFFSET;
    } else if (isIphone) {
      offset += IPHONE_EXTRA_WEB_COORD_NON_SCROLL_OFFSET;
    } else {
      offset += IPAD_EXTRA_WEB_COORD_NON_SCROLL_OFFSET;
    }
  } catch (err) {
    // no reload button, which indicates scrolling has happened
    // the URL bar may or may not be visible
    try {
      const el = await this.findNativeElementOrElements('accessibility id', 'URL', false);
      offset -= await getElementHeightMemoized('URLBar', this, el);
    } catch (ign) {
      // no URL elements found, so continue
    }
  } finally {
    // return implicit wait to what it was
    this.setImplicitWait(implicitWaitMs);
  }

  if (coords.y > webviewRect.height) {
    // when scrolling has happened, there is a tick more offset needed
    if (isIphoneX) {
      offset += IPHONE_X_EXTRA_WEB_COORD_SCROLL_OFFSET;
    } else if (isIphone) {
      offset += IPHONE_EXTRA_WEB_COORD_SCROLL_OFFSET;
    } else {
      offset += IPAD_EXTRA_WEB_COORD_SCROLL_OFFSET;
    }
  }

  // extra offset necessary
  offset += isIphone ? IPHONE_WEB_COORD_OFFSET : IPAD_WEB_COORD_OFFSET;

  offset += isIphoneX ? IPHONE_X_WEB_COORD_OFFSET : 0;

  log.debug(`Extra translated web coordinates offset: ${offset}`);
  return offset;
};

extensions.getExtraNativeWebTapOffset = async function () {
  let offset = 0;

  // keep track of implicit wait, and set locally to 0
  const implicitWaitMs = this.implicitWaitMs;
  try {
    this.setImplicitWait(0);

    // first try to get tab offset
    try {
      const el = await this.findNativeElementOrElements('-ios predicate string', `name LIKE '*, Tab' AND visible = 1`, false);
      offset += await getElementHeightMemoized('TabBar', this, el);
    } catch (ign) {
      // no element found, so no tabs and no need to deal with offset
    }

    // next try to see if there is an Smart App Banner
    try {
      await this.findNativeElementOrElements('accessibility id', 'Close app download offer', false);
      offset += await this.getSafariIsIphone() ?
        IPHONE_WEB_COORD_SMART_APP_BANNER_OFFSET :
        IPAD_WEB_COORD_SMART_APP_BANNER_OFFSET;
    } catch (ign) {
      // no smart app banner found, so continue
    }
  } finally {
    // return implicit wait to what it was
    this.setImplicitWait(implicitWaitMs);
  }

  log.debug(`Additional native web tap offset computed: ${offset}`);
  return offset;
};

async function tapWebElementNatively (driver, atomsElement) {
  // try to get the text of the element, which will be accessible in the
  // native context
  try {
    let text = await driver.executeAtom('get_text', [atomsElement]);
    if (!text) {
      text = await driver.executeAtom('get_attribute_value', [atomsElement, 'value']);
    }

    if (text) {
      const el = await driver.findNativeElementOrElements('accessibility id', text, false);
      // use tap because on iOS 11.2 and below `nativeClick` crashes WDA
      const rect = await driver.proxyCommand(`/element/${el.ELEMENT}/rect`, 'GET');
      const coords = {
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
      };
      await driver.clickCoords(coords);
      return true;
    }
  } catch (err) {
    // any failure should fall through and trigger the more elaborate
    // method of clicking
    log.warn(`Error attempting to click: ${err.message}`);
  }
  return false;
}

extensions.nativeWebTap = async function (el) {
  const atomsElement = this.useAtomsElement(el);

  if (await tapWebElementNatively(this, atomsElement)) {
    return;
  }
  log.warn('Unable to do simple native web tap. Attempting to convert coordinates');

  // `get_top_left_coordinates` returns the wrong value sometimes,
  // unless we pre-call both of these functions before the actual calls
  await this.executeAtom('get_size', [atomsElement]);
  await this.executeAtom('get_top_left_coordinates', [atomsElement]);

  const {width, height} = await this.executeAtom('get_size', [atomsElement]);
  let {x, y} = await this.executeAtom('get_top_left_coordinates', [atomsElement]);
  x += width / 2;
  y += height / 2;

  this.curWebCoords = {x, y};
  await this.clickWebCoords();
};

extensions.clickCoords = async function (coords) {
  await this.performTouch([
    {
      action: 'tap',
      options: coords,
    },
  ]);
};

extensions.translateWebCoords = async function (coords) {
  log.debug(`Translating coordinates (${JSON.stringify(coords)}) to web coordinates`);

  // absolutize web coords
  const implicitWaitMs = this.implicitWaitMs;
  let webview;
  try {
    this.setImplicitWait(0);
    webview = await retryInterval(5, 100, async () => {
      return await this.findNativeElementOrElements('-ios predicate string', `type = 'XCUIElementTypeWebView' AND visible = 1`, false);
    });
  } finally {
    this.setImplicitWait(implicitWaitMs);
  }

  webview = util.unwrapElement(webview);
  const rect = await this.proxyCommand(`/element/${webview}/rect`, 'GET');
  const wvPos = {x: rect.x, y: rect.y};
  const realDims = {w: rect.width, h: rect.height};

  const cmd = '(function () { return {w: document.documentElement.clientWidth, h: document.documentElement.clientHeight}; })()';
  const wvDims = await this.remote.execute(cmd);

  // TODO: investigate where these come from. They appear to be constants in my tests
  const urlBarHeight = 64;
  wvPos.y += urlBarHeight;

  const realDimensionHeight = 108;
  realDims.h -= realDimensionHeight;

  // add static offset for safari in landscape mode
  let yOffset = this.opts.curOrientation === 'LANDSCAPE' ? this.landscapeWebCoordsOffset : 0;

  // add extra offset for possible extra things in the top of the page
  yOffset += await this.getExtraNativeWebTapOffset();
  coords.y += await this.getExtraTranslateWebCoordsOffset(coords, rect);

  if (wvDims && realDims && wvPos) {
    let xRatio = realDims.w / wvDims.w;
    let yRatio = realDims.h / wvDims.h;
    let newCoords = {
      x: wvPos.x + Math.round(xRatio * coords.x),
      y: wvPos.y + yOffset + Math.round(yRatio * coords.y),
    };

    // additional logging for coordinates, since it is sometimes broken
    //   see https://github.com/appium/appium/issues/9159
    log.debug(`Converted coordinates: ${JSON.stringify(newCoords)}`);
    log.debug(`    rect: ${JSON.stringify(rect)}`);
    log.debug(`    wvPos: ${JSON.stringify(wvPos)}`);
    log.debug(`    realDims: ${JSON.stringify(realDims)}`);
    log.debug(`    wvDims: ${JSON.stringify(wvDims)}`);
    log.debug(`    xRatio: ${JSON.stringify(xRatio)}`);
    log.debug(`    yRatio: ${JSON.stringify(yRatio)}`);
    log.debug(`    yOffset: ${JSON.stringify(yOffset)}`);

    log.debug(`Converted web coords ${JSON.stringify(coords)} ` +
              `into real coords ${JSON.stringify(newCoords)}`);
    return newCoords;
  }
};

extensions.checkForAlert = async function () { // eslint-disable-line require-await
  return false;
};

extensions.waitForAtom = async function (promise) {
  const started = process.hrtime();
  try {
    return this.parseExecuteResponse(await B.resolve(promise)
      .timeout(ATOM_WAIT_TIMEOUT));
  } catch (err) {
    if (err instanceof B.TimeoutError) {
      throw new Error(`Did not get any response after ${process.hrtime(started)[0]}s`);
    }
    throw err;
  }
};

export default extensions;
