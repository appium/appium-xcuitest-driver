import { iosCommands } from 'appium-ios-driver';
import log from '../logger';
import _ from 'lodash';
import { errors } from 'appium-base-driver';


let extensions = {};

Object.assign(extensions, iosCommands.web);

extensions.clickCoords = async function (coords) {
  let {x, y} = coords;

  // tap on absolute coordinates
  await this.proxyCommand('/tap/nil', 'POST', {x, y});
};

extensions.translateWebCoords = async function (coords) {
  log.debug(`Translating coordinates (${JSON.stringify(coords)}) to web coordinates`);
  let webviewIndex = this.webContextIndex();

  // add static offset for safari in landscape mode
  let yOffset = this.opts.curOrientation === 'LANDSCAPE' ? this.landscapeWebCoordsOffset : 0;

  // absolutize web coords
  let webviews = await this.proxyCommand('/elements', 'POST', {using: 'class name', value: 'XCUIElementTypeWebView'});
  if (webviews.length < 1) {
    throw new errors.UnknownError.code('Could not find any webviews to click inside!');
  }
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

export default extensions;
