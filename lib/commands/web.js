import { iosCommands } from 'appium-ios-driver';
import { retryInterval } from 'asyncbox';
import { util } from 'appium-support';
import log from '../logger';
import _ from 'lodash';


let extensions = {};

Object.assign(extensions, iosCommands.web);

extensions.getElementHeightMemoized = _.memoize(async function (key, el) {
  el = util.unwrapElement(el);
  const height = (await this.getNativeRect(el)).height;
  return height;
});

extensions.getExtraNativeWebTapOffset = async function () {
  let offset = 0;

  // keep track of implicit wait, and set locally to 0
  let implicitWaitMs = this.implicitWaitMs;
  await this.setImplicitWait(0);

  // first try to get tab offset
  try {
    let el = await this.findNativeElementOrElements('-ios predicate string', `name LIKE '*, Tab' AND visible = 1`, false);
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
      let el = await this.findNativeElementOrElements('accessibility id', 'URL', false);
      // this height can vary depending on the scrolling, so compute
      // el = util.unwrapElement(el);
      // const height = (await this.getNativeRect(el)).height;
      // log.debug(`Header height decreased. Subtracting ${height} from offset`);
      // offset -= height;
      offset -= await this.getElementHeightMemoized('URLBar', el);
    } catch (ign) {
      // no URL elements found, so continue
    }
  }

  // return implicit wait to what it was
  await this.setImplicitWait(implicitWaitMs);

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
