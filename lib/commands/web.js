import { iosCommands } from 'appium-ios-driver';
import { retryInterval } from 'asyncbox';
import { util } from 'appium-support';
import log from '../logger';
import _ from 'lodash';


const EXTRA_WEB_COORD_SCROLL_OFFSET = -10;
const IPHONE_WEB_COORD_OFFSET = -10;
const IPHONE_WEB_COORD_SMART_APP_BANNER_OFFSET = 84;
const IPAD_WEB_COORD_OFFSET = 10;
const IPAD_WEB_COORD_SMART_APP_BANNER_OFFSET = 95;

let extensions = {};

Object.assign(extensions, iosCommands.web);

const getSafariIsIphone = _.memoize(async function (sessionId, driver) {
  // sessionId parameter is for memoizing per session
  let isIphone = true;
  try {
    const useragent = await driver.execute('return navigator.userAgent');
    isIphone = useragent.toLowerCase().includes('iphone');
  } catch (err) {
    log.warn(`Unable to find device type from useragent. Assuming iPhone`);
    log.debug(`Error: ${err.message}`);
  }
  return isIphone;
});

extensions.getElementHeightMemoized = _.memoize(async function (key, el) {
  el = util.unwrapElement(el);
  return (await this.getNativeRect(el)).height;
});

extensions.getExtraTranslateWebCoordsOffset = async function () {
  let offset = 0;

  // keep track of implicit wait, and set locally to 0
  const implicitWaitMs = this.implicitWaitMs;

  // try to see if there has been scrolling
  try {
    this.setImplicitWait(0);

    await this.findNativeElementOrElements('accessibility id', 'ReloadButton', false);
    // reload button found, which means scrolling has not happened
  } catch (err) {
    // no reload button, which indicates scrolling has happened
    try {
      const el = await this.findNativeElementOrElements('accessibility id', 'URL', false);
      offset -= await this.getElementHeightMemoized('URLBar', el);
    } catch (ign) {
      // no URL elements found, so continue
    }

    // when scrolling has happened, there is a tick more offset needed
    offset += EXTRA_WEB_COORD_SCROLL_OFFSET;
  } finally {
    // return implicit wait to what it was
    this.setImplicitWait(implicitWaitMs);
  }

  // extra offset necessary (where do these come from? they just work)
  offset += await getSafariIsIphone(this.opts.sessionId, this) ?
    IPHONE_WEB_COORD_OFFSET :
    IPAD_WEB_COORD_OFFSET;

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
      offset += await this.getElementHeightMemoized('TabBar', el);
    } catch (ign) {
      // no element found, so no tabs and no need to deal with offset
    }

    // next try to see if there is an Smart App Banner
    try {
      await this.findNativeElementOrElements('accessibility id', 'Close app download offer', false);
      offset += await getSafariIsIphone(this) ?
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

extensions.nativeWebTap = async function (el) {
  let atomsElement = this.useAtomsElement(el);
  let {x, y} = await this.executeAtom('get_top_left_coordinates', [atomsElement]);
  let {width, height} = await this.executeAtom('get_size', [atomsElement]);
  x = x + (width / 2);
  y = y + (height / 2);

  this.curWebCoords = {x, y};
  await this.clickWebCoords();
};

extensions.clickCoords = async function (coords) {
  let {x, y} = coords;

  // tap on absolute coordinates
  await this.proxyCommand('/wda/tap/nil', 'POST', {x, y});
};

extensions.translateWebCoords = async function (coords) {
  log.debug(`Translating coordinates (${JSON.stringify(coords)}) to web coordinates`);

  // add static offset for safari in landscape mode
  let yOffset = this.opts.curOrientation === 'LANDSCAPE' ? this.landscapeWebCoordsOffset : 0;

  // add extra offset for possible extra things in the top of the page
  yOffset += await this.getExtraNativeWebTapOffset();
  coords.y += await this.getExtraTranslateWebCoordsOffset();

  // absolutize web coords
  let webview = await retryInterval(5, 100, async () => {
    const implicitWaitMs = this.implicitWaitMs;
    try {
      this.setImplicitWait(0);
      return await this.findNativeElementOrElements('-ios predicate string', `type = 'XCUIElementTypeWebView' AND visible = 1`, false);
    } finally {
      this.setImplicitWait(implicitWaitMs);
    }
  });

  webview = util.unwrapElement(webview);
  let rect = await this.proxyCommand(`/element/${webview}/rect`, 'GET');
  let wvPos = {x: rect.x, y: rect.y};
  let realDims = {w: rect.width, h: rect.height};

  let cmd = '(function () { return {w: document.documentElement.clientWidth, h: document.documentElement.clientHeight}; })()';
  let wvDims = await this.remote.execute(cmd);

  // TODO: investigate where these come from. They appear to be constants in my tests
  let urlBarHeight = 64;
  wvPos.y += urlBarHeight;

  let realDimensionHeight = 108;
  realDims.h -= realDimensionHeight;

  if (wvDims && realDims && wvPos) {
    let xRatio = realDims.w / wvDims.w;
    let yRatio = realDims.h / wvDims.h;
    let newCoords = {
      x: wvPos.x + Math.round(xRatio * coords.x),
      y: wvPos.y + yOffset + Math.round(yRatio * coords.y),
    };

    // additional logging in the case where `y` is `null` for unknown reasons
    // see https://github.com/appium/appium/issues/9159
    if (newCoords.y === null) {
      log.debug(`Converted coordinates broken: ${newCoords}`);
      log.debug(`    rect: ${rect}`);
      log.debug(`    wvPos: ${wvPos}`);
      log.debug(`    realDims: ${realDims}`);
      log.debug(`    wvDims: ${wvDims}`);
      log.debug(`    xRatio: ${xRatio}`);
      log.debug(`    yRatio: ${yRatio}`);
      log.debug(`    yOffset: ${yOffset}`);
    }

    log.debug(`Converted web coords ${JSON.stringify(coords)} ` +
              `into real coords ${JSON.stringify(newCoords)}`);
    return newCoords;
  }
};

extensions.checkForAlert = async function () {
  return false;
};

extensions.waitForAtom = async function (promise) {
  // TODO: Add check for alert and accept/dismiss it as per autoAcceptAlert capability
  let res = null;
  try {
    res = await promise;
  } catch (err) {
    let msg = _.isString(err.message) ? err.message : JSON.stringify(err.message);
    throw new Error(`Error while executing atom: ${msg}`);
  }
  return this.parseExecuteResponse(res);
};

export default extensions;
