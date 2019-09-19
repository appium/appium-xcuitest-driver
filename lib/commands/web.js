import { iosCommands } from 'appium-ios-driver';
import { retryInterval } from 'asyncbox';
import { util } from 'appium-support';
import log from '../logger';
import _ from 'lodash';
import B from 'bluebird';

const IPHONE_TOP_BAR_HEIGHT = 71;
const IPHONE_SCROLLED_TOP_BAR_HEIGHT = 41;
const IPHONE_X_NOTCH_OFFSET_IOS_12 = 24;
const IPHONE_X_NOTCH_OFFSET_IOS_13 = 20;
const IPHONE_LANDSCAPE_TOP_BAR_HEIGHT = 51;
const IPHONE_BOTTOM_BAR_OFFSET = 49;
const TAB_BAR_OFFSET = 33;
const IPHONE_WEB_COORD_SMART_APP_BANNER_OFFSET = 84;
const IPAD_WEB_COORD_SMART_APP_BANNER_OFFSET = 95;

const IPHONE_X_WIDTH = 375;
const IPHONE_X_HEIGHT = 812;
const IPHONE_XR_WIDTH = 414;
const IPHONE_XR_HEIGHT = 896;

const ATOM_WAIT_TIMEOUT = 5 * 60000;

let extensions = {};

Object.assign(extensions, iosCommands.web);



extensions.getSafariIsIphone = _.memoize(async function getSafariIsIphone () {
  try {
    const userAgent = await this.execute('return navigator.userAgent');
    return userAgent.toLowerCase().includes('iphone');
  } catch (err) {
    log.warn(`Unable to find device type from useragent. Assuming iPhone`);
    log.debug(`Error: ${err.message}`);
  }
  return true;
});

extensions.getSafariIsIphoneX = _.memoize(async function getSafariIsIphone () {
  try {
    const script = 'return {height: window.screen.availHeight, width: window.screen.availWidth};';
    const {height, width} = await this.execute(script);
    // check for the correct height and width
    const [portraitHeight, portraitWidth] = height > width ? [height, width] : [width, height];
    return (portraitHeight === IPHONE_X_HEIGHT && portraitWidth === IPHONE_X_WIDTH) ||
           (portraitHeight === IPHONE_XR_HEIGHT && portraitWidth === IPHONE_XR_WIDTH);

  } catch (err) {
    log.warn(`Unable to find device type from dimensions. Assuming not iPhone X`);
    log.debug(`Error: ${err.message}`);
  }
  return false;
});

extensions.getExtraTranslateWebCoordsOffset = async function getExtraTranslateWebCoordsOffset (wvPos, realDims) {
  let topOffset = 0;
  let bottomOffset = 0;

  // keep track of implicit wait, and set locally to 0
  const implicitWaitMs = this.implicitWaitMs;

  const isIphone = await this.getSafariIsIphone();
  const isIphoneX = isIphone && await this.getSafariIsIphoneX();

  const orientation = realDims.h > realDims.w ? 'PORTRAIT' : 'LANDSCAPE';

  const notchOffset = isIphoneX
    ? util.compareVersions(this.opts.platformVersion, '<', '13.0')
      ? IPHONE_X_NOTCH_OFFSET_IOS_12
      : IPHONE_X_NOTCH_OFFSET_IOS_13
    : 0;

  try {
    this.setImplicitWait(0);

    // check if the full url bar is up
    await this.findNativeElementOrElements('accessibility id', 'ReloadButton', false);

    // reload button found, which means scrolling has not happened
    topOffset = IPHONE_TOP_BAR_HEIGHT + notchOffset;
    if (isIphone) {
      if (orientation === 'PORTRAIT') {
        // The bottom bar is only visible when portrait
        bottomOffset = IPHONE_BOTTOM_BAR_OFFSET;
      } else {
        topOffset = IPHONE_LANDSCAPE_TOP_BAR_HEIGHT;
      }
    }
    if (orientation === 'LANDSCAPE' || !isIphone) {
      // Tabs only appear if the device is landscape or if it's an iPad so we only check visibility in this case
      try {
        await this.findNativeElementOrElements('-ios predicate string', `name LIKE '*, Tab' AND visible = 1`, false);
        topOffset += TAB_BAR_OFFSET;
      } catch (ign) {
        // no element found, so no tabs and no need to deal with offset
      }
    }

  } catch (err) {
    // no reload button, which indicates scrolling has happened
    topOffset = IPHONE_SCROLLED_TOP_BAR_HEIGHT + notchOffset;

    // If the iPhone is landscape then there is not top bar
    if (orientation === 'LANDSCAPE' && isIphone) {
      topOffset = 0;
    }

  } finally {
    // return implicit wait to what it was
    this.setImplicitWait(implicitWaitMs);
  }

  topOffset += await this.getExtraNativeWebTapOffset();

  wvPos.y += topOffset;
  realDims.h -= (topOffset + bottomOffset);
};

extensions.getExtraNativeWebTapOffset = async function getExtraNativeWebTapOffset () {
  let offset = 0;

  // keep track of implicit wait, and set locally to 0
  const implicitWaitMs = this.implicitWaitMs;
  try {
    this.setImplicitWait(0);

    // try to see if there is an Smart App Banner
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
      const els = await driver.findNativeElementOrElements('accessibility id', text, true);
      if (els.length === 1 || els.length === 2) {
        const el = els[0];
        // use tap because on iOS 11.2 and below `nativeClick` crashes WDA
        const rect = await driver.proxyCommand(`/element/${util.unwrapElement(el)}/rect`, 'GET');
        if (els.length === 2) {
          const el2 = els[1];
          const rect2 = await driver.proxyCommand(`/element/${util.unwrapElement(el2)}/rect`, 'GET');

          if ((rect.x !== rect2.x || rect.y !== rect2.y) ||
          (rect.width !== rect2.width || rect.height !== rect2.height)) {
            // These 2 native elements are not referring to the same web element
            return false;
          }
        }
        const coords = {
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
        };
        await driver.clickCoords(coords);
        return true;
      }
    }
  } catch (err) {
    // any failure should fall through and trigger the more elaborate
    // method of clicking
    log.warn(`Error attempting to click: ${err.message}`);
  }
  return false;
}

extensions.nativeWebTap = async function nativeWebTap (el) {
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

extensions.clickCoords = async function clickCoords (coords) {
  await this.performTouch([
    {
      action: 'tap',
      options: coords,
    },
  ]);
};

extensions.translateWebCoords = async function translateWebCoords (coords) {
  log.debug(`Translating coordinates (${JSON.stringify(coords)}) to web coordinates`);

  // absolutize web coords
  const implicitWaitMs = this.implicitWaitMs;
  let webview;
  try {
    this.setImplicitWait(0);
    webview = await retryInterval(5, 100, async () => {
      return await this.findNativeElementOrElements('class name', 'XCUIElementTypeWebView', false);
    });
  } finally {
    this.setImplicitWait(implicitWaitMs);
  }

  webview = util.unwrapElement(webview);
  const rect = await this.proxyCommand(`/element/${webview}/rect`, 'GET');
  const wvPos = {x: rect.x, y: rect.y};
  const realDims = {w: rect.width, h: rect.height};

  const cmd = '(function () { return {w: window.innerWidth, h: window.innerHeight}; })()';
  const wvDims = await this.remote.execute(cmd);

  await this.getExtraTranslateWebCoordsOffset(wvPos, realDims);

  if (wvDims && realDims && wvPos) {
    let xRatio = realDims.w / wvDims.w;
    let yRatio = realDims.h / wvDims.h;
    let newCoords = {
      x: wvPos.x + Math.round(xRatio * coords.x),
      y: wvPos.y + Math.round(yRatio * coords.y),
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

    log.debug(`Converted web coords ${JSON.stringify(coords)} ` +
              `into real coords ${JSON.stringify(newCoords)}`);
    return newCoords;
  }
};

extensions.checkForAlert = async function checkForAlert () { // eslint-disable-line require-await
  return false;
};

extensions.waitForAtom = async function waitForAtom (promise) {
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
