import { iosCommands } from 'appium-ios-driver';
import { retryInterval } from 'asyncbox';
import { util } from 'appium-support';
import log from '../logger';
import _ from 'lodash';


let extensions = {};

Object.assign(extensions, iosCommands.web);

extensions.getElementHeightMemoized = _.memoize(async function (key, el) {
  el = util.unwrapElement(el);
  return (await this.getNativeRect(el)).height;
});

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

    // next try to see if there has been scrolling
    try {
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
    }
  } finally {
    // return implicit wait to what it was
    this.setImplicitWait(implicitWaitMs);
  }

  log.debug(`Additional native web tap offset computed: ${offset}`);
  return offset;
};

extensions.clickCoords = async function (coords) {
  let {x, y} = coords;

  // tap on absolute coordinates
  await this.proxyCommand('/wda/tap/nil', 'POST', {x, y});
};

extensions.translateWebCoords = async function (coords) {
  log.debug(`Translating coordinates (${JSON.stringify(coords)}) to web coordinates`);
  let webviewIndex = this.webContextIndex();

  // add static offset for safari in landscape mode
  let yOffset = this.opts.curOrientation === 'LANDSCAPE' ? this.landscapeWebCoordsOffset : 0;

  // absolutize web coords
  let webviews;
  await retryInterval(5, 100, async () => {
    webviews = await this.proxyCommand('/elements', 'POST', {using: 'class name', value: 'XCUIElementTypeWebView'});
    if (!webviews || webviews.length < 1) {
      throw new Error('Could not find any webviews to click inside!');
    }
  });
  if (_.isUndefined(webviews[webviewIndex])) {
    log.warn(`Could not find webview at index ${webviewIndex}, taking ` +
                `last available one for clicking purposes`);
    webviewIndex = webviews.length - 1;
  }

  let wvId = webviews[webviewIndex].ELEMENT;
  let rect = await this.proxyCommand(`/element/${wvId}/rect`, 'GET');
  let wvPos = {x: rect.x, y: rect.y};
  let realDims = {w: rect.width, h: rect.height};

  let cmd = '(function () { return {w: document.documentElement.clientWidth, h: document.documentElement.clientHeight}; })()';
  let {w, h} = await this.remote.execute(cmd);
  let wvDims = {w, h};

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
